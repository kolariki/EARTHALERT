const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const connectToDatabase = require('./config/db');
const Token = require('./models/tokenModel');
const { Expo } = require('expo-server-sdk');
const cron = require('node-cron');
const Feedback = require('./models/feedBack');

let ultimoSismoNotificado = null; // Variable global para almacenar el último sismo notificado



async function scrapeSismoData() {
    try {
        const response = await axios.get('https://www.inpres.gob.ar/desktop/');
        const html = response.data;
        const $ = cheerio.load(html);
        const sismoData = [];

        $('#sismos tr').each((index, element) => {
            if (index !== 0) {
                const tds = $(element).find('td');
                if (tds.length === 8 && $(tds[0]).text().trim() !== '') {
                    const sismo = {
                        numero: $(tds[0]).text().trim(),
                        fecha: $(tds[1]).text().trim(),
                        hora: $(tds[2]).text().trim(),
                        profundidad: $(tds[3]).text().trim(),
                        magnitud: $(tds[4]).text().trim(),
                        latitud: $(tds[5]).text().trim(),
                        longitud: $(tds[6]).text().trim(),
                        ubicacion: $(tds[7]).text().trim(),
                    };
                    sismoData.push(sismo);
                }
            }
        });

        return sismoData;
    } catch (error) {
        console.error('Error al obtener los datos de sismos:', error);
        return [];
    }
}

async function getLastSismo() {
    const sismoData = await scrapeSismoData();

    // Ordenar la lista de sismos por fecha y hora descendente
    sismoData.sort((a, b) => {
        const dateA = new Date(`${a.fecha} ${a.hora}`);
        const dateB = new Date(`${b.fecha} ${b.hora}`);
        return dateB - dateA;
    });

    // Devolver solo el último sismo
    const ultimoSismo = sismoData.length > 0 ? sismoData[0] : null;
    console.log('Último sismo:', ultimoSismo);
    return ultimoSismo;
}

const checkSismoProvince = async (ultimoSismo) => {
    try {
        const ubicacion = "San Juan";
//ultimoSismo?.ubicacion
        if (ubicacion) {
            let provincia;

            // Verificar si la ubicación contiene una coma (,)
            if (ubicacion.includes(',')) {
                provincia = ubicacion.split(',')[1]?.trim();
            } else {
                // Si no contiene una coma, asumir que la ubicación es solo la provincia
                provincia = ubicacion.trim();
            }

            if (provincia) {
                const provinciaMinusculas = provincia.toLowerCase(); // Convertir a minúsculas
                const tokensConProvinciaCoincidente = await Token.find({ province: { $regex: new RegExp(`^${provinciaMinusculas}$`, 'i') } }, 'token');
                const tokens = tokensConProvinciaCoincidente.map(tokenDoc => tokenDoc.token);
                console.log('Tokens obtenidos para la provincia:', tokens); // Agregar registro de tokens obtenidos
                return tokens;
            }
        }

        console.log('La ubicación del último sismo no está disponible o no tiene un formato válido.');
        return [];
    } catch (error) {
        console.error('Error al verificar la provincia del último sismo:', error);
        return [];
    }
};

const sendPushNotifications = async (ultimoSismo) => {
    const expo = new Expo();
    const messages = [];

    try {
        const tokensANotificar = "ExponentPushToken[bCUQHeDo7MXoHUM_33jm1P]";
        const validTokens = "ExponentPushToken[bCUQHeDo7MXoHUM_33jm1P]";
        console.log('Tokens válidos a notificar:', validTokens);

       for (const token of validTokens) {
            messages.push({
                to: token,
                sound: 'default',
                title: 'Nuevo sismo registrado',
                body: `Se ha registrado un nuevo sismo en ${ultimoSismo.ubicacion}.`,
                data: { ultimoSismo },
                imageUrl: 'https://postimg.cc/94Pwc1Tr/1d4af8ea', // Agrega la URL de la imagen personalizada
            });
        }

        console.log('Mensajes a enviar:', messages); // Agregar registro de mensajes a enviar

        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                console.log('Respuesta de Expo:', ticketChunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Error al enviar notificaciones push:', error);
            }
        }
    } catch (error) {
        console.error('Error al obtener los tokens de la base de datos:', error);
    }
};


// Ejecutar la tarea cada 5 minutos
cron.schedule('*/1 * * * *', async () => {
    console.log('Ejecutando tarea programada...');
    const ultimoSismo = await getLastSismo();
    if (ultimoSismo) {
        // Verificar si el último sismo ya fue notificado
        if (ultimoSismo.numero !== ultimoSismoNotificado) {
            console.log('Enviando notificaciones push para el último sismo...');
            await sendPushNotifications(ultimoSismo);
           // ultimoSismoNotificado = ultimoSismo.numero; // Actualizar el último sismo notificado
        } else {
            console.log('El último sismo ya fue notificado previamente.');
        }
    } else {
        console.log('No hay un nuevo sismo registrado.');
    }
});

connectToDatabase();

app.use(express.json());
// Conectar a la base de datos


app.get('/api/sismos', async (req, res) => {
    const sismoData = await scrapeSismoData();
    res.json(sismoData);
    console.log('Alguien se ha conectado a la API y ha solicitado los datos de sismos');
    console.log('Datos de sismos enviados:', sismoData);

    // Envía notificaciones push con los nuevos datos de sismos
    // await sendPushNotifications(sismoData);
});

app.post('/api/tokens', async (req, res) => {
    console.log('Cuerpo de la solicitud:', req.body);
    const { token, province } = req.body;
    const tokenValue = token.data; // Acceder al valor de data dentro del objeto token
    console.log('Token recibido:', tokenValue);

    try {
        // Verificar si el token ya existe en la base de datos
        const existingToken = await Token.findOne({ token });

        if (existingToken) {
            console.log('El token ya existe en la base de datos');
            res.sendStatus(200);
        } else {
            // Guardar el token y la ubicación en la base de datos
            const newToken = new Token({ token, province });
            await newToken.save();
            console.log('Token y ubicación guardados en la base de datos');
            res.sendStatus(200);
        }
    } catch (error) {
        console.error('Error al guardar el token y la ubicación en la base de datos:', error);
        res.sendStatus(500);
    }
});

app.post('/api/feedback', async (req, res) => {
    const { token, sentiste, sismoInfo } = req.body;

    try {
        // Verifica si el token es válido
        if (!Expo.isExpoPushToken(token)) {
            console.error(`Token ${token} no es un token válido de Expo`);
            return res.sendStatus(400);
        }

        // Crear una nueva instancia del modelo Feedback
        const feedback = new Feedback({
            token,
            sentiste,
            sismoInfo,
        });

        // Guardar el feedback en la base de datos
        await feedback.save();

        console.log('Feedback guardado:', feedback);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error al guardar el feedback:', error);
        res.sendStatus(500);
    }
});


app.listen(3000, () => {
    console.log('API escuchando en el puerto 3000');
});

