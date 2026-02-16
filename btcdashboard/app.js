let moeda = "brl";
let chart = null;

async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function autenticar() {
    const senha = document.getElementById("senha").value;
    const hash = await sha256(senha);

    if (hash === HASH_SENHA_CORRETA) {
        document.getElementById("login").hidden = true;
        document.getElementById("dashboard").hidden = false;
        carregarGrafico(30);
        atualizarDados();
        setInterval(atualizarDados, 60000);
    } else {
        document.getElementById("erro").innerText = "Senha incorreta";
    }
}

async function atualizarDados() {
    try {
        const r = await fetch(`https://blockstream.info/api/address/${ENDERECO_BTC}`);
        const j = await r.json();

        const saldoSat = j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum;
        const btc = saldoSat / 1e8;

        const p = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${moeda}`);
        const preco = (await p.json()).bitcoin[moeda];

        document.getElementById("btc").innerText = btc.toFixed(8) + " BTC";
        document.getElementById("sats").innerText = saldoSat.toLocaleString() + " sats";
        document.getElementById("fiat").innerText =
            (moeda === "brl" ? "R$ " : "$ ") + (btc * preco).toFixed(2);

        document.getElementById("status").innerText =
            "Atualizado: " + new Date().toLocaleTimeString();

    } catch {
        document.getElementById("status").innerText = "Erro ao atualizar dados";
    }
}

async function carregarGrafico(dias) {
    const agora = Math.floor(Date.now() / 1000);
    const inicio = agora - dias * 86400;

    const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=${moeda}&from=${inicio}&to=${agora}`
    );
    const j = await r.json();

    const labels = j.prices.map(p => new Date(p[0]).toLocaleDateString());
    const data = j.prices.map(p => p[1]);

    if (chart) chart.destroy();

    chart = new Chart(document.getElementById("grafico"), {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: `BTC (${moeda.toUpperCase()})`,
                data,
                borderColor: "#00ffcc"
            }]
        }
    });
}

function alternarMoeda() {
    moeda = moeda === "brl" ? "usd" : "brl";
    carregarGrafico(30);
    atualizarDados();
}

function copiarEndereco() {
    navigator.clipboard.writeText(ENDERECO_BTC);
}

async function carregarPrecoBTC() {
    try {
        const response = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl"
        );
        const data = await response.json();

        document.getElementById("btc-usd").innerText =
            "$ " + data.bitcoin.usd.toLocaleString("en-US");

        document.getElementById("btc-brl").innerText =
            "R$ " + data.bitcoin.brl.toLocaleString("pt-BR");

    } catch (erro) {
        document.getElementById("btc-usd").innerText = "Erro";
        document.getElementById("btc-brl").innerText = "Erro";
        console.error("Erro ao carregar preço BTC:", erro);
    }
}

// carrega ao abrir a página
carregarPrecoBTC();

// atualiza automaticamente a cada 60 segundos
setInterval(carregarPrecoBTC, 60000);
