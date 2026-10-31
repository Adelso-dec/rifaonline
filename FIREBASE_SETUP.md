# Configurando o Firebase para a Página de Rifa

Siga esses passos uma única vez para ligar a página ao Firestore. Depois disso, as reservas de número ficam sincronizadas em tempo real entre todos os visitantes.

## 1. Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**.
2. Dê um nome (ex: `rifa-online`) e conclua a criação (pode desativar o Google Analytics, não é necessário).

## 2. Criar o banco Firestore

1. No menu lateral, vá em **Firestore Database** → **Criar banco de dados**.
2. Escolha **Iniciar em modo de produção** (vamos configurar as regras manualmente no passo 4).
3. Selecione a localização mais próxima (ex: `southamerica-east1`).

## 3. Registrar o app Web e pegar as credenciais

1. Na tela inicial do projeto, clique no ícone **`</>`** (Web) para registrar um app.
2. Dê um apelido (ex: `pagina-rifa`) — **não** marque "Firebase Hosting" (vamos usar o GitHub Pages).
3. Copie o objeto `firebaseConfig` mostrado na tela.
4. Cole esses valores no arquivo [js/firebase-config.js](js/firebase-config.js), substituindo os placeholders (`SUA_API_KEY`, etc).

> Esses valores não são segredos — podem ficar em um repositório público no GitHub. A segurança de verdade vem das regras do Firestore (próximo passo).

## 4. Ativar o login do organizador (Authentication)

1. No menu lateral, vá em **Authentication** → **Sign-in method**.
2. Ative o provedor **E-mail/senha**.
3. Vá na aba **Users** → **Add user** e crie o usuário que você (organizador) vai usar para entrar no painel admin (`admin.html`) — é com esse e-mail/senha que você faz login lá.

## 5. Aplicar as regras de segurança

1. No Firestore, vá na aba **Regras**.
2. Apague o conteúdo e cole o conteúdo do arquivo [firestore.rules](firestore.rules) deste projeto.
3. Clique em **Publicar**.

## 6. Testar localmente

Como o `app.js` usa módulos ES (`import`/`export`) para falar com o Firebase, **não dá para simplesmente abrir o `index.html` clicando duas vezes** — o navegador bloqueia imports de módulo via `file://`. É preciso servir os arquivos por um servidor local:

```powershell
# na pasta do projeto
python -m http.server 8080
```

Depois acesse `http://localhost:8080` no navegador.

Se preferir, qualquer servidor estático funciona (extensão "Live Server" do VS Code, `npx serve`, etc.) — o importante é acessar via `http://` e não `file://`.

## 7. Verificando se funcionou

- Ao abrir a página, se as credenciais ainda forem os placeholders, aparece um aviso: "⚠️ Configure as credenciais do Firebase".
- Depois de configurado, reserve um número em uma aba e abra a página em outra aba (ou outro navegador) — o número deve aparecer como "reservado" em tempo real na segunda aba.
- Acesse `http://localhost:8080/admin.html`, entre com o e-mail/senha criados no passo 4 e confirme o pagamento do número que você acabou de reservar. Ele deve virar "vendido" em tempo real também na página pública.
