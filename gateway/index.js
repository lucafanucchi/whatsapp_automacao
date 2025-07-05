// Importando as bibliotecas necessárias
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Boom } = require('@hapi/boom');
const cors = require('cors'); // NOVO: Importando a biblioteca CORS

// Configuração do servidor web
const app = express();

// NOVO: Habilitando o CORS para que nosso frontend local possa acessar o gateway no Render
app.use(cors()); 

app.use(express.json());
const PORT = process.env.PORT || 3000;

let sock; 
let qrCodeData = null; // Variável para armazenar o texto do QR Code

// Função principal para conectar ao WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // ALTERADO: Não vamos mais imprimir no terminal
    });

    // Listener para eventos de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("QR Code recebido. Disponível via API em /qr-code.");
            qrCodeData = qr; // Armazenamos o QR Code na nossa variável
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

    // Salva as credenciais
    sock.ev.on('creds.update', saveCreds);
}

// Rota de status
app.get('/status', (req, res) => {
    const isConnected = sock && sock.ws.isOpen;
    res.json({
        status: 'ok',
        connected: isConnected,
    });
});

// NOVO: Rota para o frontend buscar o QR Code
app.get('/qr-code', (req, res) => {
    if (qrCodeData) {
        res.json({ qr: qrCodeData });
    } else {
        res.status(404).json({ message: 'Nenhum QR Code disponível.' });
    }
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