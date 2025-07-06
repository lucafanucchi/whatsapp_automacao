// Importando as bibliotecas necessárias
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const cors = require('cors');
const fs = require('fs'); // NOVO: Importando o módulo de sistema de arquivos do Node.js

// Configuração do servidor web
const app = express();
app.use(cors()); 
app.use(express.json());
const PORT = process.env.PORT || 3000;

let sock; 
let qrCodeData = null;

// ... (A função connectToWhatsApp continua exatamente a mesma)
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    sock = makeWASocket({ auth: state, printQRInTerminal: false });
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("QR Code recebido. Disponível via API em /qr-code.");
            qrCodeData = qr;
        }
        if (connection === 'close') {
            qrCodeData = null;
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada, motivo:', lastDisconnect.error, ', reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            qrCodeData = null;
            console.log('Conexão com o WhatsApp aberta com sucesso!');
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// ---- API ENDPOINTS ----

// Rota de status (sem alterações)
app.get('/status', (req, res) => {
    const isConnected = sock && sock.ws.isOpen;
    res.json({ status: 'ok', connected: isConnected });
});

// Rota para buscar o QR Code (sem alterações)
app.get('/qr-code', (req, res) => {
    if (qrCodeData) {
        res.json({ qr: qrCodeData });
    } else {
        res.status(404).json({ message: 'Nenhum QR Code disponível.' });
    }
});

// Rota para enviar mensagens (sem alterações)
app.post('/send-message', async (req, res) => {
    // ... (o código aqui permanece o mesmo)
});

// NOVO: Rota para forçar o logout e limpar a sessão
app.post('/logout', async (req, res) => {
    console.log("Recebida requisição de logout...");
    try {
        // 1. Desconecta o socket atual se ele existir
        if (sock) {
            await sock.logout();
            console.log("Socket desconectado.");
        }
        
        // 2. Apaga a pasta de autenticação do disco do servidor
        const authDir = 'auth_info_baileys';
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log("Pasta de autenticação apagada com sucesso.");
        }

        res.status(200).json({ success: true, message: 'Sessão encerrada. O gateway irá reiniciar e gerar um novo QR Code.' });
        
        // 3. Força o reinício do processo. O Render irá reiniciá-lo automaticamente.
        console.log("Forçando o reinício do serviço...");
        process.exit(1);

    } catch (error) {
        console.error("Erro no processo de logout:", error);
        res.status(500).json({ success: false, error: 'Falha ao fazer logout.' });
    }
});


// Inicia o servidor e a conexão com o WhatsApp
app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});