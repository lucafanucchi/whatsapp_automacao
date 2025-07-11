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


app.post('/send-message', (req, res) => {
    const { number, message, imageUrl } = req.body;

    if (connectionStatus !== 'open') {
        return res.status(503).json({ success: false, message: 'Gateway não está conectado e autenticado ao WhatsApp.' });
    }
    if (!number) {
        return res.status(400).json({ success: false, message: 'O campo "number" é obrigatório.' });
    }
    if (!message && !imageUrl) {
        return res.status(400).json({ success: false, message: 'A mensagem não pode estar vazia sem um anexo.' });
    }

    res.status(202).json({ success: true, message: 'Pedido recebido. O envio será processado em segundo plano.' });

    (async () => {
        try {
            const recipientId = `${number}@s.whatsapp.net`;
            console.log(`Processando envio em segundo plano para: ${number}`);
            
            let messageContent;
            
            // =============================================================================
            // LÓGICA ATUALIZADA PARA DIFERENCIAR IMAGEM DE PDF
            // =============================================================================
            if (imageUrl) {
                // Verifica se a URL, em minúsculas, termina com .pdf
                if (imageUrl.toLowerCase().endsWith('.pdf')) {
                    // Se for PDF, monta um objeto de documento
                    messageContent = {
                        document: { url: imageUrl },
                        caption: message,
                        fileName: "Documento.pdf" // Nome que aparecerá para o cliente no WhatsApp
                    };
                    console.log(`Preparando para enviar PDF para ${number}`);
                } else {
                    // Senão, trata como imagem (comportamento que já tínhamos)
                    messageContent = {
                        image: { url: imageUrl },
                        caption: message
                    };
                    console.log(`Preparando para enviar Imagem para ${number}`);
                }
            } else {
                // Se não houver URL, envia só texto
                messageContent = {
                    text: message
                };
            }
            
            await sock.sendMessage(recipientId, messageContent);
            console.log(`SUCESSO (segundo plano): Mensagem com/sem anexo enviada para ${number}`);

        } catch (error) {
            console.error(`ERRO (segundo plano) ao tentar enviar para ${number}:`, error);
        }
    })();
});

app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});