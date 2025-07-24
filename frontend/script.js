// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================

const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com"; // Sua URL de produção
const urlParams = new URLSearchParams(window.location.search);
const INSTANCE_NAME = urlParams.get('instancia');

// =============================================================================
// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// =============================================================================

const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');
const qrCodeWrapper = document.getElementById('qrcode-wrapper') || document.getElementById('qrcode-container');
const statusConexaoDiv = document.getElementById('status-conexao');
const stuckContainer = document.getElementById('stuck-container');
const forceRefreshBtn = document.getElementById('force-refresh-btn');
const logoutBtnPrincipal = document.getElementById('logout-btn-principal');
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const anexoInput = document.getElementById('anexo-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');
const previewImagem = document.getElementById('preview-imagem');
const previewMensagem = document.getElementById('preview-mensagem');
const previewPdfContainer = document.getElementById('preview-pdf-container');
const previewPdfFilename = document.getElementById('preview-pdf-filename');
const previewVideo = document.getElementById('preview-video');


// =============================================================================
// --- GERENCIAMENTO DE ESTADO E INICIALIZAÇÃO ---
// =============================================================================

let statusPollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!INSTANCE_NAME) {
        document.body.innerHTML = '<h1 style="font-family: sans-serif; text-align: center; margin-top: 50px; color: red;">Erro: O nome da instância não foi fornecido na URL. Exemplo: /index.html?instancia=nome_do_seu_cliente</h1>';
        throw new Error("Instância não definida na URL.");
    }
    verificarStatusInicial();
});


// =============================================================================
// --- LÓGICA DE CONEXÃO CORRETA E FINAL ---
// =============================================================================

async function verificarStatusInicial() {
    try {
        adicionarLog('Verificando status da conexão...', 'info-small');
        const response = await fetch(`${BACKEND_URL}/conectar/status/${INSTANCE_NAME}`);
        const data = await response.json();

        if (data.status === 'open') {
            // Se já estiver conectado, mostra o painel principal.
            mostrarTelaPrincipal();
        } else {
            // Se não estiver conectado, inicia o processo de conexão com QR Code.
            mostrarTelaDeConexao();
            iniciarProcessoDeConexao();
        }
    } catch (error) {
        console.error("Erro crítico ao verificar status inicial:", error);
        statusConexaoDiv.innerHTML = '<span style="color: red;">Falha ao conectar ao servidor do backend.</span>';
        mostrarTelaDeConexao();
    }
}

async function iniciarProcessoDeConexao() {
    try {
        statusConexaoDiv.textContent = 'Gerando QR Code, por favor aguarde...';
        qrCodeWrapper.innerHTML = ''; 
        const response = await fetch(`${BACKEND_URL}/conectar/qr-code/${INSTANCE_NAME}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao buscar QR Code do servidor.');
        }
        
        const data = await response.json();
        
        if (data && data.base64) {
            const qrImage = document.createElement('img');
            qrImage.src = data.base64;
            qrImage.alt = "QR Code do WhatsApp";
            qrImage.style.width = "250px";
            qrImage.style.height = "250px";
            qrCodeWrapper.appendChild(qrImage);

            statusConexaoDiv.textContent = 'QR Code pronto! Escaneie com seu celular.';
            comecarPollingDeStatus();
        } else {
            throw new Error('A API não retornou os dados do QR Code.');
        }

    } catch (error) {
        console.error("Erro no processo de conexão:", error);
        statusConexaoDiv.innerHTML = `<span style="color: red;">Erro ao gerar QR Code: ${error.message}</span>`;
        stuckContainer.style.display = 'block'; 
    }
}

function comecarPollingDeStatus() {
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    statusPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/conectar/status/${INSTANCE_NAME}`);
            const data = await response.json();
            if (data.status === 'open') {
                mostrarTelaPrincipal();
            }
        } catch (error) {
            console.error("Erro no polling de status:", error);
        }
    }, 5000);
}

// =============================================================================
// --- LÓGICA DE LOGOUT E ENVIO (JÁ ESTAVAM CORRETAS) ---
// =============================================================================

async function executarLogout() {
    if (!confirm("Tem certeza que deseja desconectar a sessão atual do WhatsApp?")) return;
    this.disabled = true;
    this.textContent = 'Desconectando...';
    try {
        const response = await fetch(`${BACKEND_URL}/conectar/logout/${INSTANCE_NAME}`, { method: 'POST' }); // Pode ser POST ou DELETE
        if (!response.ok) throw new Error('Falha ao processar o logout no servidor.');
        adicionarLog('Desconectado com sucesso!', 'success');
        verificarStatusInicial(); // Reinicia o ciclo, que mostrará a tela de conexão
    } catch (error) {
        alert(`Erro ao desconectar: ${error.message}`);
    } finally {
        this.disabled = false;
        this.textContent = this.id.includes('principal') ? 'Desconectar' : 'Forçar Nova Sessão';
    }
}

logoutBtnPrincipal.addEventListener('click', executarLogout);
forceRefreshBtn.addEventListener('click', executarLogout);


// =============================================================================
// --- LÓGICA DE ENVIO DE CAMPANHA (ADAPTADA) ---
// =============================================================================

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    let mensagem = mensagemTextarea.value.trim();
    const numerosTextoCompleto = numerosTextarea.value.trim();
    const contatos = numerosTextoCompleto.split('\n').filter(line => line.trim() !== '').map(line => {
        const parts = line.split(',');
        return { numero: parts[0] ? parts[0].trim() : '', nome: parts[1] ? parts[1].trim() : '' };
    });

    const anexoArquivo = anexoInput.files[0];
    if ((!mensagem && !anexoArquivo) || contatos.length === 0) {
        adicionarLog('É necessário ter uma mensagem ou um anexo, e uma lista de contatos.', 'error');
        return;
    }

    if (numerosTextoCompleto) {
        localStorage.setItem('listaNumerosSalva', numerosTextoCompleto);
    }

    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = '';

    let anexoKey = null;
    if (anexoArquivo) {
        adicionarLog('Preparando upload do arquivo...');
        try {
            anexoKey = await uploadAnexoParaR2(anexoArquivo);
            adicionarLog(`Upload concluído!`, 'success');
        } catch (error) {
            adicionarLog(`Falha no upload do arquivo: ${error.message}`, 'error');
            enviarBtn.disabled = false;
            enviarBtn.textContent = 'Enviar Campanha';
            return;
        }
    }

    adicionarLog(`Iniciando campanha para ${contatos.length} contato(s).`);

    let contadorEnvios = 0;
    for (const contato of contatos) {
        contadorEnvios++;
        adicionarLog(`(${contadorEnvios}/${contatos.length}) Preparando para ${contato.nome || contato.numero}...`);
        let mensagemPersonalizada = mensagem.replace(/\{nome\}/gi, contato.nome || '').trim();

        try {
            await enviarMensagemParaBackend(contato.numero, mensagemPersonalizada, anexoKey, anexoArquivo ? anexoArquivo.type : null, anexoArquivo ? anexoArquivo.name : null);
            adicionarLog(`--> Sucesso: Pedido para ${contato.nome || contato.numero} foi aceito.`, 'success');
        } catch (error) {
            adicionarLog(`--> Falha ao enviar para ${contato.nome || contato.numero}. Detalhes: ${error.message}`, 'error');
        }

        if (contadorEnvios < contatos.length) {
            const delay = (contadorEnvios % 10 === 0) 
                ? Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000 
                : Math.floor(Math.random() * (28000 - 15000 + 1)) + 15000;
            
            const delayEmSegundos = (delay / 1000).toFixed(1);
            const tipoLog = (delay > 50000) ? 'info' : 'info-small';
            adicionarLog(`Aguardando ${delayEmSegundos} segundos...`, tipoLog);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    adicionarLog('Campanha finalizada!');
    enviarBtn.disabled = false;
    enviarBtn.textContent = 'Enviar Campanha';
});

async function enviarMensagemParaBackend(numero, mensagem, anexoKey = null, mimeType = null, originalFileName = null) {
    // A chamada agora inclui o INSTANCE_NAME na URL
    const endpoint = `${BACKEND_URL}/enviar/${INSTANCE_NAME}`;
    const payload = {
        numero: numero.trim(),
        mensagem: mensagem,
        anexo_key: anexoKey,
        mime_type: mimeType,
        original_file_name: originalFileName
    };
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro desconhecido do servidor.');
    }
    return response.json();
}


// =============================================================================
// --- FUNÇÕES AUXILIARES E DE UI (SUA LÓGICA ORIGINAL PRESERVADA) ---
// =============================================================================

function mostrarTelaPrincipal() {
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }
    telaConexao.style.display = 'none';
    telaPrincipal.style.display = 'block';
    const listaSalva = localStorage.getItem('listaNumerosSalva');
    if (listaSalva) {
        numerosTextarea.value = listaSalva;
    }
}

function mostrarTelaDeConexao() {
    telaPrincipal.style.display = 'none';
    telaConexao.style.display = 'flex';
}

function adicionarLog(texto, tipo = 'info') {
    const logElement = document.createElement('div');
    logElement.textContent = texto;
    logElement.className = `log ${tipo}`;
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight;
}

async function uploadAnexoParaR2(arquivo) {
    adicionarLog('Solicitando permissão de upload...', 'info-small');
    const urlResponse = await fetch(`${BACKEND_URL}/gerar-url-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: arquivo.name, content_type: arquivo.type }),
    });
    if (!urlResponse.ok) throw new Error('Falha ao obter URL de upload do servidor.');
    const { upload_url, object_key } = await urlResponse.json();
    adicionarLog('Enviando arquivo para a nuvem...', 'info-small');
    const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': arquivo.type },
        body: arquivo
    });
    if (!uploadResponse.ok) throw new Error('O envio do arquivo para o serviço de nuvem falhou.');
    return object_key;
}

mensagemTextarea.addEventListener('input', (event) => {
    previewMensagem.textContent = event.target.value || "Sua mensagem aparecerá aqui...";
});

anexoInput.addEventListener('change', (event) => {
    const arquivo = event.target.files[0];
    previewImagem.style.display = 'none';
    previewPdfContainer.style.display = 'none';
    previewVideo.style.display = 'none';
    previewImagem.src = '';
    previewVideo.src = '';
    if (arquivo) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (arquivo.type.startsWith('image/')) {
                previewImagem.src = e.target.result;
                previewImagem.style.display = 'block';
            } else if (arquivo.type.startsWith('video/')) {
                previewVideo.src = e.target.result;
                previewVideo.style.display = 'block';
            }
        }
        if (arquivo.type.startsWith('image/') || arquivo.type.startsWith('video/')) {
             reader.readAsDataURL(arquivo);
        } else if (arquivo.type === "application/pdf") {
            previewPdfFilename.textContent = arquivo.name;
            previewPdfContainer.style.display = 'flex';
        }
    }
});