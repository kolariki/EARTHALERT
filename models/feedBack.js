const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
    },
    sentiste: {
        type: Boolean,
        required: true,
    },
    sismoInfo: {
        type: Object,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;