// --- CONFIGURAÇÃO PRINCIPAL ---
const CLOUDINARY_CLOUD_NAME = "di1axitma";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com";
const GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com";

// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// Telas
const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');

// Elementos da Tela de Conexão
const qrContainer = document.getElementById('qrcode-container');
const statusConexaoDiv = document.getElementById('status-conexao');
const logoutBtnConexao = document.getElementById('logout-btn');

// Elementos da Tela Principal
const logoutBtnPrincipal = document.getElementById('logout-btn-principal'); // NOVO
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const imagemInput = document.getElementById('imagem-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');

// --- LÓGICA DE CONTROLE DAS TELAS E ESTADO ---
let qrCodePollingInterval = null;

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

async function verificarStatusInicial() { /* ...código existente... */ }
function iniciarPollingQrCode() { /* ...código existente... */ }

// --- LÓGICA DOS EVENTOS (CLICKS) ---
document.addEventListener('DOMContentLoaded', verificarStatusInicial);

// NOVO: Ambos os botões de logout agora chamam a mesma função
logoutBtnConexao.addEventListener('click', executarLogout);
logoutBtnPrincipal.addEventListener('click', executarLogout);

// NOVO: Função de logout reutilizável
async function executarLogout(event) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Desconectando...';
    
    try {
        await fetch(`${GATEWAY_URL}/logout`, { method: 'POST' });
        // Mostra uma mensagem na tela de conexão, que é para onde vamos voltar
        statusConexaoDiv.textContent = 'Sessão encerrada com sucesso. Recarregando...';
        // Recarrega a página para reiniciar o processo de verificação
        setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
        alert("Falha ao encerrar sessão. Verifique o console.");
        btn.disabled = false;
    }
}

form.addEventListener('submit', async function(event) { /* ...código existente de envio de campanha... */ });

// --- FUNÇÕES AUXILIARES ---
async function uploadImagemParaCloudinary(arquivo) { /* ...código existente... */ }
async function enviarMensagemParaBackend(numero, mensagem, imagemUrl = null) { /* ...código existente... */ }
function adicionarLog(texto, tipo = 'info') { /* ...código existente... */ }