// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================
const CLOUDINARY_CLOUD_NAME = "di1axitma";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com";
const GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com"; // Usado para status e QR code

// =============================================================================
// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// =============================================================================
// Telas
const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');

// Elementos da Tela de Conexão
const qrContainer = document.getElementById('qrcode-container');
const statusConexaoDiv = document.getElementById('status-conexao');
const logoutBtn = document.getElementById('logout-btn');

// Elementos da Tela Principal (Formulário de Campanha)
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const imagemInput = document.getElementById('imagem-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');

// =============================================================================
// --- LÓGICA DE CONTROLE DAS TELAS E ESTADO ---
// =============================================================================
let qrCodePollingInterval = null; // Para controlar o loop de verificação do QR

// Função que mostra a tela correta baseada no status da conexão
function gerenciarVisibilidadeTelas(estaConectado) {
    if (estaConectado) {
        telaPrincipal.style.display = 'block';
        telaConexao.style.display = 'none';
        if (qrCodePollingInterval) clearInterval(qrCodePollingInterval);
    } else {
        telaPrincipal.style.display = 'none';
        telaConexao.style.display = 'flex';
        iniciarPollingQrCode();
    }
}

// Função que verifica o status do gateway no servidor
async function verificarStatusInicial() {
    try {
        const response = await fetch(`${GATEWAY_URL}/status`);
        const data = await response.json();
        gerenciarVisibilidadeTelas(data.connected);
    } catch (error) {
        console.error("Erro ao verificar status inicial:", error);
        statusConexaoDiv.textContent = '❌ Erro ao conectar com o servidor.';
        gerenciarVisibilidadeTelas(false);
    }
}

// Inicia a verificação do QR code, rodando em loop
function iniciarPollingQrCode() {
    if (qrCodePollingInterval) clearInterval(qrCodePollingInterval); // Limpa loop anterior se houver

    qrCodePollingInterval = setInterval(async () => {
        try {
            // Primeiro, verifica se já conectou
            const statusResponse = await fetch(`${GATEWAY_URL}/status`);
            const statusData = await statusResponse.json();
            if (statusData.connected) {
                gerenciarVisibilidadeTelas(true);
                return;
            }

            // Se não conectou, busca o QR code
            const qrResponse = await fetch(`${GATEWAY_URL}/qr-code`);
            if (qrResponse.ok) {
                const qrData = await qrResponse.json();
                qrContainer.innerHTML = ''; // Limpa o container
                new QRCode(qrContainer, { text: qrData.qr, width: 250, height: 250 });
                statusConexaoDiv.textContent = 'Escaneie o código para conectar.';
                logoutBtn.style.display = 'inline-block';
            } else {
                statusConexaoDiv.textContent = 'Aguardando QR Code do servidor...';
                qrContainer.innerHTML = ''; // Limpa QR code antigo
            }
        } catch (error) {
            statusConexaoDiv.textContent = '❌ Erro ao buscar QR Code.';
        }
    }, 4000); // Verifica a cada 4 segundos
}

// =============================================================================
// --- LÓGICA DOS EVENTOS (CLICKS) ---
// =============================================================================

// Inicia tudo quando a página carrega
document.addEventListener('DOMContentLoaded', verificarStatusInicial);

// Evento do botão de logout
logoutBtn.addEventListener('click', async () => {
    adicionarLog("Encerrando sessão...", 'info');
    try {
        await fetch(`${GATEWAY_URL}/logout`, { method: 'POST' });
        adicionarLog("Sessão encerrada. A página será recarregada.", 'success');
        setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
        adicionarLog("Falha ao encerrar sessão.", 'error');
    }
});

// Evento de envio do formulário de campanha (código que já tínhamos)
form.addEventListener('submit', async function(event) {
    // ... (toda a lógica de envio de campanha que já está funcionando permanece aqui)
});

// =============================================================================
// --- FUNÇÕES AUXILIARES (JÁ EXISTENTES) ---
// =============================================================================
async function uploadImagemParaCloudinary(arquivo) { /* ...código existente... */ }
async function enviarMensagemParaBackend(numero, mensagem, imagemUrl = null) { /* ...código existente... */ }
function adicionarLog(texto, tipo = 'info') { /* ...código existente... */ }