// Importando as bibliotecas necessárias
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

// Configuração do servidor web
const app = express();
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// IMPORTANTE PARA O RENDER: Usa a porta fornecida pelo ambiente ou 3000 como padrão
const PORT = process.env.PORT || 3000;

let sock; // Variável para armazenar nossa conexão com o WhatsApp

// Função principal para conectar ao WhatsApp
async function connectToWhatsApp() {
    // `useMultiFileAuthState` salva a sessão para não precisar ler o QR code toda vez
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Imprime o QR code no terminal (ou nos logs do Render)
    });

    // Listener para eventos de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("QR Code recebido, escaneie com seu celular:");
            qrcode.generate(qr, { small: true }); // Mostra o QR code menor no terminal
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada, motivo:', lastDisconnect.error, ', reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexão com o WhatsApp aberta com sucesso!');
        }
    });

    // Salva as credenciais (sessão) sempre que forem atualizadas
    sock.ev.on('creds.update', saveCreds);
}

// Rota de teste para verificar se o servidor está no ar
app.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        connected: sock && sock.ws.isOpen,
    });
});

// Rota principal para enviar mensagens
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    
    // Validação se estamos conectados
    if (!sock || !sock.ws.isOpen) {
        return res.status(503).json({ error: 'Gateway não está conectado ao WhatsApp.' });
    }

    if (!number || !message) {
        return res.status(400).json({ error: 'Os campos "number" e "message" são obrigatórios.' });
    }

    try {
        // Formata o número para o padrão do WhatsApp (código do país + ddd + numero + @s.whatsapp.net)
        const recipientId = `${number}@s.whatsapp.net`;
        
        const [result] = await sock.onWhatsApp(recipientId);

        if (!result || !result.exists) {
            return res.status(404).json({ error: 'O número não existe no WhatsApp.' });
        }

        await sock.sendMessage(recipientId, { text: message });
        console.log(`Mensagem enviada para: ${number}`);
        res.status(200).json({ success: true, message: `Mensagem enviada para ${number}` });

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ success: false, error: 'Falha ao enviar a mensagem.' });
    }
});

// Inicia o servidor e a conexão com o WhatsApp
app.listen(PORT, () => {
    console.log(`Gateway de WhatsApp rodando na porta ${PORT}`);
    connectToWhatsApp();
});