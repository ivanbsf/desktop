# Hub de sites (GitHub Pages)

Site estático em HTML/CSS/JS puro. Arquivos: `index.html`, `styles.css`, `app.js`, `cofre.js`, `sites.json`.
As imagens enviadas ficam em `assets/site-icons/` (ícones) e `assets/fundo-*.jpg` (fundo), criadas ao publicar.

## 1. Publicar no GitHub Pages
1. Coloque estes arquivos em uma pasta do repositório (ex.: `hub/`) ou na raiz de um repositório novo.
2. Em **Settings → Pages**, escolha a branch e a pasta `/ (root)` e salve.
3. Acesse `https://usuario.github.io/repositorio/pasta/`. Dono, repositório e pasta são detectados pela URL; se precisar, ajuste `CONFIG` no topo do `app.js`.

## 2. Token em cofre criptografado
1. Crie um **fine-grained token** só para este repositório, com permissão **Contents: Read and write**.
2. Abra o seu gerador de cofre (AES-GCM + PBKDF2) **no seu computador**, informe o token e uma senha mestre forte, e copie o resultado.
3. Cole o resultado em `cofre.js`, substituindo `const COFRE_EMBUTIDO = null;`.
4. Nunca coloque o token real em arquivo algum nem em commit. Como o cofre é público, a segurança depende da senha mestre: use uma longa e única.

## 3. Editar e atualizar os dados
- **Com token:** clique em **Editar**, digite a senha mestre, altere cards e aparência e clique em **Publicar**. O app envia as imagens e o `sites.json` pela API do GitHub; o Pages atualiza em cerca de 1 minuto.
- **Sem token:** clique em **Editar → Editar sem publicar**, faça as alterações e use **Exportar JSON**. Substitua o `sites.json` do repositório pelo arquivo baixado (imagens novas vão embutidas nele).
- O token existe só na memória da aba e some ao sair ou recarregar.
