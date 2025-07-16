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

app.post('/verify-number', async (req, res) => {
    const { number } = req.body;
    if (!sock || connectionStatus !== 'open') {
        return res.status(503).json({ error: 'Gateway não conectado.' });
    }
    if (!number) {
        return res.status(400).json({ error: 'Número não fornecido.' });
    }

    try {
        // Tentativa 1: Verificar o número como foi recebido (potencialmente com 9 dígitos)
        const [result] = await sock.onWhatsApp(number);
        if (result?.exists) {
            // Se existir, retorna o número confirmado (JID sem o sufixo @s.whatsapp.net)
            return res.json({ success: true, correctedNumber: result.jid.split('@')[0] });
        }
        
        // Tentativa 2: Se não existir e for um número brasileiro de 9 dígitos, tenta remover o 9
        const ddd = number.substring(2, 4);
        const numeroLocal = number.substring(4);

        if (number.startsWith('55') && numeroLocal.length === 9 && numeroLocal.startsWith('9')) {
            const numeroSemNove = `55${ddd}${numeroLocal.substring(1)}`;
            const [resultSemNove] = await sock.onWhatsApp(numeroSemNove);
            if (resultSemNove?.exists) {
                return res.json({ success: true, correctedNumber: resultSemNove.jid.split('@')[0] });
            }
        }
        
        // Se nenhuma tentativa funcionar, o número não foi encontrado
        return res.status(404).json({ success: false, message: 'Número não encontrado no WhatsApp.' });

    } catch (error) {
        console.error("Erro na verificação do número:", error);
        res.status(500).json({ error: 'Erro interno ao verificar o número.' });
    }
});


app.post('/send-message', (req, res) => {
    const { number, message, anexoUrl, fileName, mimeType } = req.body;

    if (connectionStatus !== 'open') {
        return res.status(503).json({ success: false, message: 'Gateway não está conectado e autenticado ao WhatsApp.' });
    }
    if (!number || (!message && !anexoUrl)) {
        return res.status(400).json({ success: false, message: 'Requisição inválida.' });
    }

    res.status(202).json({ success: true, message: 'Pedido recebido. O envio será processado em segundo plano.' });

    (async () => {
        try {
            const recipientId = `${number}@s.whatsapp.net`;
            console.log(`Processando envio em segundo plano para: ${number}`);
            
            // --- NOVO: SIMULAÇÃO DE DIGITAÇÃO ---
            await sock.sendPresenceUpdate('composing', recipientId);
            const delayDigitando = Math.floor(Math.random() * 2000) + 1000; // Espera de 1 a 3 segundos
            await new Promise(resolve => setTimeout(resolve, delayDigitando));
            // --- FIM DA SIMULAÇÃO ---
            
            let messageContent;
            
            if (anexoUrl) {
                if (mimeType && mimeType.startsWith('video')) {
                    messageContent = {
                        video: { url: anexoUrl },
                        caption: message
                    };
                    console.log(`Preparando para enviar Vídeo para ${number}`);

                } else if (mimeType && mimeType === 'application/pdf') {
                    messageContent = {
                        document: { url: anexoUrl },
                        caption: message,
                        fileName: fileName || "Documento.pdf"
                    };
                    console.log(`Preparando para enviar PDF para ${number}`);

                } else {
                    messageContent = {
                        image: { url: anexoUrl },
                        caption: message
                    };
                    console.log(`Preparando para enviar Imagem para ${number}`);
                }
            } else {
                messageContent = {
                    text: message
                };
            }
            
            await sock.sendMessage(recipientId, messageContent);
            await sock.sendPresenceUpdate('paused', recipientId); // Limpa o status "digitando"

            console.log(`SUCESSO (segundo plano): Mensagem com anexo enviada para ${number}`);

        } catch (error) {
            console.error(`ERRO (segundo plano) ao tentar enviar para ${number}:`, error);
        }
    })();
});

app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});