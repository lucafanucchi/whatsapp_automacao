// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================

// ATENÇÃO: Coloque aqui a URL do seu backend implantado no Render ou em outro serviço.
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com"; // Exemplo local. Troque pela sua URL de produção.

// ATENÇÃO: Coloque aqui o nome EXATO da instância que você criou no Evolution Manager.
// --- NOVO: LÓGICA PARA TORNAR A INSTÂNCIA DINÂMICA ---
const urlParams = new URLSearchParams(window.location.search);
const INSTANCE_NAME = urlParams.get('instancia');

if (!INSTANCE_NAME) {
    document.body.innerHTML = '<h1 style="font-family: sans-serif; text-align: center; margin-top: 50px; color: red;">Erro: O nome da instância não foi fornecido na URL. Exemplo: /index.html?instancia=nome_do_seu_cliente</h1>';
    // Trava a execução se não houver instância.
    throw new Error("Instância não definida na URL.");
}

// =============================================================================
// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// =============================================================================

// Telas principais
const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');

// Elementos da Tela de Conexão
const qrCodeWrapper = document.getElementById('qrcode-wrapper');
const statusConexaoDiv = document.getElementById('status-conexao');
const stuckContainer = document.getElementById('stuck-container');
const forceRefreshBtn = document.getElementById('force-refresh-btn');

// Elementos da Tela Principal
const logoutBtnPrincipal = document.getElementById('logout-btn-principal');
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const anexoInput = document.getElementById('anexo-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');

// Elementos do Preview
const previewImagem = document.getElementById('preview-imagem');
const previewMensagem = document.getElementById('preview-mensagem');
const previewPdfContainer = document.getElementById('preview-pdf-container');
const previewPdfFilename = document.getElementById('preview-pdf-filename');
const previewVideo = document.getElementById('preview-video');


// =============================================================================
// --- GERENCIAMENTO DE ESTADO E INICIALIZAÇÃO ---
// =============================================================================

let statusPollingInterval = null;

// Ao carregar a página, verifica o status da conexão para decidir qual tela mostrar.
document.addEventListener('DOMContentLoaded', verificarStatusInicial);


// =============================================================================
// --- LÓGICA DE CONEXÃO E QR CODE ---
// =============================================================================

async function verificarStatusInicial() {
    try {
        adicionarLog('Verificando status da conexão com o servidor...', 'info-small');
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
        qrCodeWrapper.innerHTML = ''; // Limpa QR Code antigo

        const response = await fetch(`${BACKEND_URL}/conectar/qr-code/${INSTANCE_NAME}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao buscar QR Code do servidor.');
        }
        
        const data = await response.json();
        
        // Renderiza a imagem base64 recebida do backend
        qrCodeWrapper.innerHTML = `<img src="data:image/png;base64,${data.base64}" alt="QR Code do WhatsApp" style="width: 250px; height: 250px;"/>`;
        statusConexaoDiv.textContent = 'QR Code pronto! Escaneie com seu celular.';

        // Inicia a verificação periódica do status APÓS gerar o QR Code
        comecarPollingDeStatus();

    } catch (error) {
        console.error("Erro no processo de conexão:", error);
        statusConexaoDiv.innerHTML = `<span style="color: red;">Erro ao gerar QR Code: ${error.message}</span>`;
        stuckContainer.style.display = 'block'; // Mostra a opção de forçar nova sessão
    }
}

function comecarPollingDeStatus() {
    if (statusPollingInterval) clearInterval(statusPollingInterval);

    statusPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/conectar/status/${INSTANCE_NAME}`);
            const data = await response.json();

            if (data.status === 'open') {
                mostrarTelaPrincipal(); // Conectou com sucesso!
            }
            // Se o status for 'close', continua no loop esperando a leitura.

        } catch (error) {
            console.error("Erro durante o polling de status:", error);
            // Opcional: Adicionar uma mensagem de erro temporária
        }
    }, 5000); // Verifica a cada 5 segundos
}


// =============================================================================
// --- LÓGICA DE LOGOUT ---
// =============================================================================

async function executarLogout() {
    if (!confirm("Tem certeza que deseja desconectar a sessão atual do WhatsApp?")) return;

    this.disabled = true;
    this.textContent = 'Desconectando...';

    try {
        const response = await fetch(`${BACKEND_URL}/conectar/logout/${INSTANCE_NAME}`, { method: 'POST' });
        if (!response.ok) throw new Error('Falha ao processar o logout no servidor.');

        adicionarLog('Desconectado com sucesso!', 'success');
        mostrarTelaDeConexao();
        iniciarProcessoDeConexao(); // Reinicia o ciclo para uma nova conexão

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
// --- LÓGICA DE ENVIO DE CAMPANHA ---
// =============================================================================

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    let mensagem = mensagemTextarea.value.trim();
    const numerosTextoCompleto = numerosTextarea.value.trim();
    
    const contatos = numerosTextoCompleto.split('\n').filter(line => line.trim() !== '').map(line => {
        const parts = line.split(',');
        return {
            numero: parts[0] ? parts[0].trim() : '',
            nome: parts[1] ? parts[1].trim() : ''
        };
    });

    const anexoArquivo = anexoInput.files[0];
    if ((!mensagem && !anexoArquivo) || contatos.length === 0) {
        adicionarLog('É necessário ter uma mensagem ou um anexo, e uma lista de contatos.', 'error');
        return;
    }

    if (numerosTextoCompleto) {
        localStorage.setItem('listaNumerosSalva', numerosTextoCompleto);
        adicionarLog('Lista de contatos salva para uso futuro.', 'info-small');
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
            await enviarMensagemParaBackend(
                contato.numero, 
                mensagemPersonalizada, 
                anexoKey, 
                anexoArquivo ? anexoArquivo.type : null, 
                anexoArquivo ? anexoArquivo.name : null
            );
            adicionarLog(`--> Sucesso: Pedido para ${contato.nome || contato.numero} foi aceito.`, 'success');
        } catch (error) {
            adicionarLog(`--> Falha ao enviar para ${contato.nome || contato.numero}. Detalhes: ${error.message}`, 'error');
        }

        if (contadorEnvios < contatos.length) {
            const delay = (contadorEnvios % 10 === 0) 
                ? Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000 // Pausa longa
                : Math.floor(Math.random() * (28000 - 15000 + 1)) + 15000; // Delay curto
            
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
    const endpoint = `${BACKEND_URL}/enviar/${INSTANCE_NAME}`; // Novo endpoint com o nome da instância
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
// --- FUNÇÕES AUXILIARES E DE UI (SEM ALTERAÇÕES SIGNIFICATIVAS) ---
// =============================================================================

function mostrarTelaPrincipal() {
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }
    telaConexao.style.display = 'none';
    telaPrincipal.style.display = 'block';
    stuckContainer.style.display = 'none';
    
    // Recupera a lista de números salva quando o usuário se conecta
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

// Lógica de upload (sem alterações)
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

// Lógica de preview (sem alterações)
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