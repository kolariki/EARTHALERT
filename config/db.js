const mongoose = require('mongoose');

const uri = "mongodb+srv://ivankolariki1990:Iko89600@sismosapp.3ibj2l8.mongodb.net/?retryWrites=true&w=majority&appName=SismosApp";

const connectToDatabase = async () => {
    try {
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Conectado a la base de datos de MongoDB');
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        process.exit(1);
    }
};

module.exports = connectToDatabase;