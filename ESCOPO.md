# Escopo do Projeto — Página de Rifa Online

## 1. Objetivo

Criar uma página web para divulgação e venda de uma rifa com números de **1 a 100**, hospedada gratuitamente no **GitHub Pages**, permitindo que visitantes escolham um número disponível, informem seus dados e paguem via **PIX**, com confirmação manual pelo organizador. O status dos números (disponível, reservado, vendido) deve ficar sincronizado em tempo real para todos os visitantes.

## 2. Público-alvo

- Organizador da rifa (você): administra números, confirma pagamentos, realiza o sorteio.
- Compradores: acessam o link público, escolhem um número e realizam o pagamento.

## 3. Arquitetura Técnica

| Camada | Tecnologia | Motivo |
|---|---|---|
| Hospedagem (frontend) | GitHub Pages | Gratuito, estático, já definido pelo usuário |
| Frontend | HTML + CSS + JavaScript (vanilla ou framework leve, ex: nenhum build necessário) | Simplicidade, sem necessidade de build/deploy complexo |
| Backend / Banco de dados | **Firebase (Firestore + Authentication)** | Plano gratuito (Spark) atende tranquilamente o volume de uma rifa; SDK client-side funciona direto de uma página estática no GitHub Pages, com sincronização em tempo real (`onSnapshot`) |
| Autenticação do admin | Firebase Authentication (e-mail/senha) | Protege o painel administrativo sem precisar de servidor próprio |

> Observação: Firebase foi escolhido entre as opções porque dispensa qualquer servidor intermediário — a página estática fala diretamente com o Firestore pelo SDK JS, inclusive para leitura/escrita em tempo real. Supabase seria equivalente; a escolha final entre os dois é só uma questão de preferência de sintaxe/API, a arquitetura é a mesma.

### Por que isso resolve a limitação do GitHub Pages
O GitHub Pages serve apenas arquivos estáticos (não roda código de servidor). Usando Firestore como banco de dados "nas costas" da página estática, conseguimos:
- Atualização em tempo real do status dos números para todos os visitantes simultaneamente.
- Evitar que duas pessoas reservem o mesmo número ao mesmo tempo (via transação atômica no Firestore).
- Painel admin autenticado sem precisar de servidor próprio.

## 4. Funcionalidades

### 4.1 Página pública (compradores)
- Grade visual com os números de 1 a 100, cada um em um "quadrado"/botão.
- Cores/estados distintos:
  - 🟢 Disponível
  - 🟡 Reservado (aguardando confirmação de pagamento)
  - 🔴 Vendido/Pago
- Ao clicar em um número disponível, abre um formulário com:
  - Nome completo
  - WhatsApp/telefone
  - (Opcional) e-mail
- Ao confirmar, o número muda para "Reservado" e é exibida a chave PIX + QR Code para pagamento.
- Campo/instrução para envio do comprovante (ex: link de WhatsApp pré-preenchido com o número escolhido, já que o GitHub Pages não processa upload de arquivos sem backend — o comprovante é enviado fora do site).
- Reserva com **expiração automática** (ex: 30–60 minutos): se o pagamento não for confirmado pelo admin nesse prazo, o número volta a ficar disponível (evita números "travados" por desistência).
- Informações da rifa: prêmio, valor do número, data do sorteio, regulamento básico.
- Exibição do número de participantes / números restantes (opcional, gera urgência).

### 4.2 Painel administrativo (organizador)
- Login protegido (Firebase Authentication).
- Lista de todos os números com status, nome do comprador e contato.
- Botão para confirmar pagamento (muda status de "Reservado" → "Vendido").
- Botão para liberar/cancelar uma reserva manualmente.
- Botão para marcar número como vendido diretamente (ex: venda combinada por fora).
- Exportar lista de compradores (CSV) para controle externo.
- Funcionalidade de **sorteio**: botão que sorteia aleatoriamente um dos números vendidos e exibe o resultado (vencedor) na tela.

### 4.3 Fora de escopo (v1)
- Pagamento automático via gateway (Mercado Pago, Stripe etc.) — fica como evolução futura.
- Upload direto de comprovante de pagamento dentro do site (exigiria storage/backend adicional).
- Múltiplas rifas simultâneas no mesmo painel (v1 assume uma rifa ativa por vez).
- Envio automático de e-mail/SMS de confirmação.

## 5. Fluxo do usuário (comprador)

1. Acessa o link da rifa.
2. Visualiza a grade de números e escolhe um disponível.
3. Preenche nome e WhatsApp.
4. Número fica "Reservado" (bloqueado para outros, com prazo de expiração).
5. Recebe chave PIX/QR Code e instrução de enviar comprovante via WhatsApp.
6. Organizador confirma o pagamento no painel admin.
7. Número muda para "Vendido" (visível a todos).
8. Na data do sorteio, organizador realiza o sorteio (na página ou por sorteio externo, ex: Loteria Federal) e divulga o vencedor.

## 6. Estrutura de dados (Firestore)

```
raffles (coleção)
  └─ {raffleId} (documento) — dados gerais: título, prêmio, preço, data do sorteio, status

numbers (subcoleção de raffles/{raffleId})
  └─ {1..100} (documento, id = número)
       - status: "available" | "reserved" | "sold"
       - buyerName
       - buyerPhone
       - reservedAt (timestamp)
       - expiresAt (timestamp)
```

## 7. Regras de negócio e segurança

- Regras do Firestore devem impedir que o cliente marque um número como "sold" diretamente (só o admin autenticado pode); o cliente só pode mudar "available" → "reserved".
- Reserva usa **transação** no Firestore para evitar condição de corrida (duas pessoas clicando no mesmo número ao mesmo tempo).
- Expiração de reserva pode ser checada no client (comparando `expiresAt` com o horário atual) ou via Cloud Function agendada (fora do plano gratuito pode ter custo mínimo — avaliar se compensa ou se checagem no client basta para o volume da rifa).
- Dados de contato dos compradores visíveis apenas no painel admin (autenticado), nunca na página pública.

## 8. Design/UX

- Layout responsivo (mobile-first, já que a maioria vai acessar pelo WhatsApp no celular).
- Grade de números adaptável (ex: 10x10 no desktop, scroll/grid menor no mobile).
- Visual simples e confiável (cores do prêmio/campanha, fotos do prêmio se houver).

## 9. Fases de entrega sugeridas

1. **Fase 1 — MVP estático**: grade de números com dados mockados localmente (sem Firebase), só para validar layout.
2. **Fase 2 — Integração Firebase**: conectar Firestore, reserva em tempo real, formulário de comprador.
3. **Fase 3 — Painel admin**: login, confirmação de pagamento, exportação CSV.
4. **Fase 4 — Sorteio e finalização**: funcionalidade de sorteio, página de resultado/vencedor.
5. **Fase 5 — Deploy no GitHub Pages**: configurar domínio/subpath, testar fluxo completo de ponta a ponta.

## 10. Riscos e pontos de atenção

- Chaves de configuração do Firebase (apiKey etc.) ficam visíveis no código-fonte público do GitHub — isso é esperado e seguro *desde que as regras de segurança do Firestore estejam bem configuradas* (a apiKey do Firebase não é um segredo por si só).
- Como o repositório é público no GitHub, qualquer lógica sensível (ex: confirmação de pagamento) deve ser protegida por regras de segurança no banco, nunca por "esconder" código no frontend.
- Reservas sem expiração automática via servidor podem exigir o admin verificar/liberar manualmente de vez em quando.
