# Awesome Download Manager — Design Spec

**Data:** 2026-05-16
**Status:** Aprovado

---

## Visão Geral

Gerenciador de downloads desktop cross-platform (Windows, macOS, Linux) com funções de IA configuráveis. Construído com Tauri (Rust no backend) + React + Redux no frontend.

**Protocolos suportados:** HTTP, HTTPS, FTP

---

## Arquitetura

### Camadas

```
┌─────────────────────────────────────────┐
│           Frontend (React + Redux)       │
│  - UI de cards de download              │
│  - Redux store: downloads, config, IA   │
│  - Tauri event listeners                │
└──────────────┬──────────────────────────┘
               │ Tauri Commands / Events
┌──────────────▼──────────────────────────┐
│           Backend Rust (Tauri)           │
│                                         │
│  ┌─────────────┐   ┌─────────────────┐  │
│  │ Download    │   │   AI Service    │  │
│  │ Engine      │   │                 │  │
│  │ - HTTP/FTP  │   │ - File analysis │  │
│  │ - Chunking  │   │ - Mirror search │  │
│  │ - Speed cap │   │ - Malware check │  │
│  │ - SHA256    │   │ - Resumo        │  │
│  └──────┬──────┘   └────────┬────────┘  │
│         │                   │           │
│  ┌──────▼───────────────────▼────────┐  │
│  │     SQLite (via rusqlite)         │  │
│  │  - histórico de downloads         │  │
│  │  - cache de análises de IA        │  │
│  │  - configurações                  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Comunicação Frontend ↔ Backend

- Frontend invoca **Tauri commands** para ações: `start_download`, `pause_download`, `resume_download`, `cancel_download`, `analyze_url`, `search_mirrors`.
- Backend emite **Tauri events** em tempo real: `download:progress`, `download:complete`, `download:error`, `ai:result`, `ai:error`.
- Sem polling — comunicação 100% event-driven.

---

## Download Engine (Rust)

### Chunked Download (HTTP/HTTPS)

1. Requisição `HEAD` para obter `Content-Length` e verificar suporte a `Range`.
2. Se suportado: divide em N chunks (padrão: 8, configurável) e baixa em paralelo com `tokio::spawn`.
3. Cada chunk escreve na posição correta do arquivo via `seek` em um `Arc<Mutex<File>>` compartilhado.
4. Se `Range` não suportado: download em stream único.

### FTP

- Usa crate `suppaftp` com suporte async.
- Sem chunking paralelo (limitação do protocolo FTP).
- Mesma interface de progresso e eventos do HTTP.

### Controle de Velocidade

- Implementação `TokenBucket` em Rust.
- Configuração `max_speed: u64` armazenada internamente em **bytes/s**; exibida na UI em **KB/s** (0 = sem limite).
- Aplicável por download individualmente e como limite global somado.

### SHA256

- Calculado em streaming durante o download — cada chunk alimenta um `sha2::Sha256` hasher.
- Hash disponível ao completar o download, sem releitura do arquivo.
- Exibido no card expandido com botão "Copiar" e link direto para VirusTotal.

### Retomada de Downloads

- Metadados de progresso (chunks concluídos, bytes por chunk) persistidos no SQLite.
- Downloads interrompidos podem ser retomados do ponto exato onde pararam.

### Retry em Falhas de Rede

- Falhas transientes (timeout, reset de conexão) disparam retry automático com backoff exponencial: 1s, 2s, 4s, máximo 3 tentativas por chunk.
- Após esgotar as tentativas, o download vai para status `error` e o usuário pode retomar manualmente.
- Erros HTTP permanentes (4xx) não fazem retry — vão direto para `error`.

### Crates principais

| Crate | Uso |
|---|---|
| `tokio` | async runtime |
| `reqwest` | HTTP/HTTPS |
| `suppaftp` | FTP |
| `sha2` | SHA256 |
| `rusqlite` | SQLite |
| `serde` / `serde_json` | serialização |
| `keyring` | armazenamento seguro de API keys |

---

## AI Service (Rust)

### Provedores Configuráveis

- Suporte a Claude (Anthropic), OpenAI, e qualquer API compatível com o formato OpenAI.
- Requisições HTTP construídas manualmente via `reqwest` — sem SDK externo.
- Enum `AiProvider` com um formatter por variante. Adicionar novo provedor = novo variant + formatter.

### AI Gate

- Ao iniciar, o backend verifica se existe API key configurada no keyring.
- Redux store mantém flag `aiEnabled: boolean` derivado dessa verificação.
- Quando `aiEnabled = false`:
  - Botões de IA ficam **visíveis mas desabilitados** (`opacity` reduzida, `cursor: not-allowed`).
  - Ícone `!` laranja em cada botão desabilitado.
  - Banner amarelo com link direto para Configurações: *"Funções de IA desativadas. Configurar →"*
  - Tooltip no hover explica que é necessário configurar credenciais.
  - Nenhuma chamada de rede para IA é feita.

### Análise de URL/Arquivo (pré-download)

- Ativada quando usuário clica "Analisar Primeiro" no dialog de novo download.
- Backend faz `HEAD` na URL e envia à IA: URL, headers (`Content-Type`, `Content-Disposition`, tamanho), nome do arquivo.
- Prompt estruturado solicita:
  1. Tipo e descrição do arquivo.
  2. Avaliação de risco (baseada em URL, extensão, tamanho, nome).
  3. Se o arquivo é potencialmente malicioso.
- Resultado cacheado no SQLite por `url_hash` — mesma URL não repete chamada.
- Se a IA retornar risco **alto**: download não é bloqueado automaticamente, mas o dialog exibe um aviso vermelho destacado pedindo confirmação explícita do usuário ("Este arquivo pode ser perigoso. Deseja continuar?"). O usuário tem a palavra final.

### Busca de Mirrors (Híbrida)

1. **Busca web:** Chama uma Search API (Brave Search ou SerpAPI — configurável) com query gerada pela IA a partir do nome do arquivo.
2. **Lista hardcoded:** Consulta mirrors confiáveis pré-definidos (GitHub Releases, SourceForge, mirrors de distros Linux, CTAN, etc.).
3. IA ranqueia os candidatos por confiabilidade e proximidade geográfica aproximada.
4. Resultado: lista ordenada de URLs alternativos exibida no card expandido.

### SHA256 + VirusTotal

- Hash gerado localmente durante o download (sem IA).
- Card exibe hash copiável + link: `https://www.virustotal.com/gui/file/{sha256}` (sempre disponível, sem API key).
- Opcional: se usuário tiver API key do VirusTotal configurada, submissão automática e exibição do resultado no card.

---

## Frontend (React + Redux)

### Redux Store

```
store/
  downloads/   - lista, progresso, status (active/paused/complete/error)
  ai/          - resultados de análise por download ID, loading state
  config/      - max_speed, dest_folder, ai_provider, aiEnabled, search_provider
  ui/          - card expandido, modal aberto
```

### Componentes Principais

| Componente | Responsabilidade |
|---|---|
| `DownloadCard` | Card compacto: barra de progresso, velocidade, ETA, badges de IA |
| `DownloadCardExpanded` | SHA256, botões de IA, mirrors, resumo, resultado de malware |
| `AddDownloadModal` | Input de URL, seleção de pasta, botões "Baixar Agora" / "Analisar Primeiro" |
| `SettingsPage` | API keys, provedor, velocidade máxima, pasta padrão, chunks |
| `GlobalSpeedBar` | Controle de velocidade global e contador de downloads ativos |

### Fluxo de Dados

- Componentes escutam eventos Tauri via `listen()` — sem polling.
- Cada evento dispara um Redux action que atualiza o store.
- Componentes conectados ao store via `useSelector`.

### Tecnologias

- React 18, Redux Toolkit, TailwindCSS.
- Sem biblioteca de componentes externa — UI própria e leve.

---

## Configurações e Armazenamento

### SQLite

Banco local em `~/.config/awesome-download-manager/db.sqlite`:

```sql
-- Histórico e estado de downloads
downloads (
  id, url, filename, dest_path, total_bytes,
  status, created_at, completed_at, chunks_json
)

-- Cache de análises de IA
ai_cache (
  url_hash, result_json, created_at
)

-- Configurações gerais (sem API keys)
settings (key, value)
```

### API Keys

- Armazenadas via `keyring` no cofre seguro do SO:
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: libsecret / KWallet
- SQLite guarda apenas referência ao keyring entry, nunca o valor em texto.

### Tela de Settings

| Configuração | Tipo | Padrão |
|---|---|---|
| Pasta de destino | picker nativo Tauri | `~/Downloads` |
| Velocidade máxima global | KB/s na UI (0 = sem limite; armazenado internamente em bytes/s) | `0` |
| Provedor de IA | enum | — |
| API key de IA | campo mascarado + "Testar" | — |
| Search API provider | Brave / SerpAPI | — |
| Search API key | campo mascarado | — |
| VirusTotal API key | campo mascarado (opcional) | — |
| Chunks paralelos | número (1–16) | `8` |

---

## Fluxo de Adicionar Download

1. Usuário cola URL no `AddDownloadModal`.
2. Dialog exibe dois botões:
   - **"Baixar Agora"** — inicia imediatamente.
   - **"Analisar Primeiro"** — desabilitado com `!` se IA não configurada; se configurada, chama `analyze_url` e aguarda resultado antes de iniciar.
3. Usuário pode sobrescrever a pasta de destino via picker nativo.
4. Download adicionado ao store e card aparece na lista principal.

---

## Funcionalidades Fora do MVP

As seguintes funcionalidades foram explicitamente excluídas do MVP para manter o escopo:

- Suporte a torrents / magnet links
- Integração com navegadores (extensão de browser)
- Contas de usuário ou sincronização em nuvem
- Agendamento de downloads
- Notificações push do sistema (além das nativas do Tauri)
