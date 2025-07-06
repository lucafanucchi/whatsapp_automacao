// Importando as bibliotecas necessárias
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const cors = require('cors');
const fs = require('fs');

// Configuração do servidor web
const app = express();
app.use(cors()); 
app.use(express.json());
const PORT = process.env.PORT || 3000;

let sock; 
let qrCodeData = null;
// NOVO: Variável para rastrear o status real da conexão
let connectionStatus = 'connecting'; 

// Função principal para conectar ao WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    sock = makeWASocket({ auth: state, printQRInTerminal: false });

    // Listener para eventos de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // NOVO: Atualiza nosso rastreador de status
        if (connection) {
            connectionStatus = connection;
        }
        
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
            console.log('Conexão com o WhatsApp aberta e autenticada com sucesso!');
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// ---- API ENDPOINTS ----

// Rota de status (CORRIGIDA)
app.get('/status', (req, res) => {
    // ALTERADO: Agora verificamos o status correto
    const isConnected = connectionStatus === 'open';
    res.json({ 
        status: 'ok', 
        connected: isConnected,
        connection_status: connectionStatus // Enviando o status detalhado para debug
    });
});

// Rota para buscar o QR Code (sem alterações)
app.get('/qr-code', (req, res) => {
    if (qrCodeData) {
        res.json({ qr: qrCodeData });
    } else {
        res.status(404).json({ message: 'Nenhum QR Code disponível.' });
    }
});

// Rota para logout (sem alterações)
app.post('/logout', async (req, res) => {
    console.log("Recebida requisição de logout...");
    try {
        if (sock) { await sock.logout(); }
        const authDir = 'auth_info_baileys';
        if (fs.existsSync(authDir)) { fs.rmSync(authDir, { recursive: true, force: true }); }
        res.status(200).json({ success: true, message: 'Sessão encerrada.' });
        console.log("Logout e limpeza concluídos. Forçando o reinício do serviço...");
        process.exit(1);
    } catch (error) {
        console.error("Erro no processo de logout:", error);
        res.status(500).json({ success: false, error: 'Falha ao fazer logout.' });
    }
});

// Rota para enviar mensagens (sem alterações)
app.post('/send-message', async (req, res) => {
    // ... o código aqui permanece o mesmo, mas adicionamos uma verificação mais robusta
    if (connectionStatus !== 'open') {
        return res.status(503).json({ error: 'Gateway não está conectado e autenticado ao WhatsApp.' });
    }
    // ... resto do código de envio
});

// Inicia o servidor e a conexão com o WhatsApp
app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});