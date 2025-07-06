// ... (imports e configurações iniciais continuam os mesmos)
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors()); 
app.use(express.json());
const PORT = process.env.PORT || 3000;

let sock; 
let qrCodeData = null;
let connectionStatus = 'connecting'; 
// ... (a função connectToWhatsApp continua a mesma)
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    sock = makeWASocket({ auth: state, printQRInTerminal: false });
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection) { connectionStatus = connection; }
        if (qr) {
            console.log("QR Code recebido.");
            qrCodeData = qr;
        }
        if (connection === 'close') {
            qrCodeData = null;
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) { connectToWhatsApp(); }
        } else if (connection === 'open') {
            qrCodeData = null;
            console.log('Conexão autenticada com sucesso!');
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// ... (as rotas /status, /qr-code, e /logout continuam as mesmas)
app.get('/status', (req, res) => {
    const isConnected = connectionStatus === 'open';
    res.json({ status: 'ok', connected: isConnected, connection_status: connectionStatus });
});

app.get('/qr-code', (req, res) => {
    if (qrCodeData) { res.json({ qr: qrCodeData }); } 
    else { res.status(404).json({ message: 'Nenhum QR Code disponível.' }); }
});

app.post('/logout', async (req, res) => {
    try {
        if (sock) { await sock.logout(); }
        const authDir = 'auth_info_baileys';
        if (fs.existsSync(authDir)) { fs.rmSync(authDir, { recursive: true, force: true }); }
        res.status(200).json({ success: true, message: 'Sessão encerrada.' });
        process.exit(1);
    } catch (error) { res.status(500).json({ success: false, error: 'Falha ao fazer logout.' }); }
});


// =============================================================================
// MUDANÇA ARQUITETURAL IMPORTANTE AQUI!
// =============================================================================
app.post('/send-message', (req, res) => {
    const { number, message } = req.body;

    if (connectionStatus !== 'open') {
        return res.status(503).json({ success: false, message: 'Gateway não está conectado e autenticado ao WhatsApp.' });
    }
    if (!number || !message) {
        return res.status(400).json({ success: false, message: 'Os campos "number" e "message" são obrigatórios.' });
    }

    // 1. Responde IMEDIATAMENTE para o backend, dizendo que o pedido foi aceito.
    res.status(202).json({ success: true, message: 'Pedido recebido. O envio será processado em segundo plano.' });

    // 2. Tenta fazer o trabalho pesado de enviar a mensagem EM SEGUNDO PLANO.
    (async () => {
        try {
            const recipientId = `${number}@s.whatsapp.net`;
            console.log(`Processando envio em segundo plano para: ${number}`);
            
            const [result] = await sock.onWhatsApp(recipientId);
            if (!result || !result.exists) {
                console.error(`FALHA (segundo plano): O número ${number} não existe no WhatsApp.`);
                return;
            }

            await sock.sendMessage(recipientId, { text: message });
            console.log(`SUCESSO (segundo plano): Mensagem enviada para ${number}`);

        } catch (error) {
            console.error(`ERRO (segundo plano) ao tentar enviar para ${number}:`, error);
        }
    })(); // A função é chamada imediatamente aqui
});


// Inicia o servidor e a conexão
app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});