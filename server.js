const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização e Conexão com o Banco de Dados SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
    }
});

// Criação da Tabela de Agendamentos caso não exista
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servico TEXT NOT NULL,
            barbeiro TEXT NOT NULL,
            data TEXT NOT NULL,
            horario TEXT NOT NULL,
            cliente TEXT NOT NULL,
            whatsapp TEXT NOT NULL,
            status TEXT DEFAULT 'Agendado',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Helper para converter preço do serviço em número
function extrairPreco(servicoStr) {
    if (!servicoStr) return 0;
    const match = servicoStr.match(/R\$\s*([\d.,]+)/);
    if (match) {
        return parseFloat(match[1].replace('.', '').replace(',', '.'));
    }
    return 0;
}

// ROTA 1: Criar novo agendamento (Tela do Cliente)
app.post('/api/agendamentos', (req, res) => {
    const { servico, barbeiro, data, horario, cliente, whatsapp } = req.body;

    if (!servico || !barbeiro || !data || !horario || !cliente || !whatsapp) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    // Validação para evitar duplo agendamento para o mesmo barbeiro no mesmo dia e horário
    const checkQuery = `SELECT * FROM agendamentos WHERE barbeiro = ? AND data = ? AND horario = ? AND status != 'Cancelado'`;
    db.get(checkQuery, [barbeiro, data, horario], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            return res.status(400).json({ error: 'Este barbeiro já possui um agendamento para este horário.' });
        }

        const insertQuery = `
            INSERT INTO agendamentos (servico, barbeiro, data, horario, cliente, whatsapp, status)
            VALUES (?, ?, ?, ?, ?, ?, 'Agendado')
        `;
        db.run(insertQuery, [servico, barbeiro, data, horario, cliente, whatsapp], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({
                message: 'Agendamento realizado com sucesso!',
                id: this.lastID
            });
        });
    });
});

// ROTA 2: Buscar agendamentos e calcular KPIs do Painel
app.get('/api/agendamentos', (req, res) => {
    const { data } = req.query;

    let query = "SELECT * FROM agendamentos";
    let params = [];

    if (data) {
        query += " WHERE data = ?";
        params.push(data);
    }

    query += " ORDER BY horario ASC";

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Busca todos os agendamentos para calcular as métricas (KPIs)
        db.all("SELECT * FROM agendamentos", [], (errAll, allRows) => {
            if (errAll) {
                return res.json(rows); // Retorna só a lista se falhar o cálculo
            }

            const hojeStr = data || new Date().toISOString().split('T')[0];
            const mesAtualStr = hojeStr.substring(0, 7); // YYYY-MM

            let fatHoje = 0;
            let fatMes = 0;
            const vendasPorBarbeiro = {};
            const contagemServicos = {};

            allRows.forEach(item => {
                const valor = extrairPreco(item.servico);
                const itemData = item.data;

                // Faturamento Hoje (Apenas Concluídos)
                if (itemData === hojeStr && item.status === 'Concluído') {
                    fatHoje += valor;
                }

                // Faturamento do Mês (Apenas Concluídos)
                if (itemData && itemData.startsWith(mesAtualStr) && item.status === 'Concluído') {
                    fatMes += valor;

                    // Vendas por Barbeiro
                    if (!vendasPorBarbeiro[item.barbeiro]) {
                        vendasPorBarbeiro[item.barbeiro] = 0;
                    }
                    vendasPorBarbeiro[item.barbeiro] += valor;
                }

                // Serviço Mais Popular (no mês)
                if (itemData && itemData.startsWith(mesAtualStr) && item.status !== 'Cancelado') {
                    const nomeServico = item.servico.split('(')[0].trim();
                    contagemServicos[nomeServico] = (contagemServicos[nomeServico] || 0) + 1;
                }
            });

            // Encontra Barbeiro Destaque
            let barbeiroDestaque = 'Nenhum ainda';
            let maiorVenda = 0;
            for (const [barbeiro, total] of Object.entries(vendasPorBarbeiro)) {
                if (total > maiorVenda) {
                    maiorVenda = total;
                    barbeiroDestaque = barbeiro;
                }
            }

            // Encontra Serviço Popular
            let servicoPopular = 'Nenhum ainda';
            let maiorQtd = 0;
            for (const [servico, qtd] of Object.entries(contagemServicos)) {
                if (qtd > maiorQtd) {
                    maiorQtd = qtd;
                    servicoPopular = servico;
                }
            }

            // Retorna lista com os dados no formato aceito pelo painel
            res.json({
                agendamentos: rows,
                kpis: {
                    faturamentoHoje: fatHoje.toFixed(2).replace('.', ','),
                    faturamentoMes: fatMes.toFixed(2).replace('.', ','),
                    barbeiroDestaque: barbeiroDestaque,
                    vendasBarbeiro: maiorVenda.toFixed(2).replace('.', ','),
                    servicoPopular: servicoPopular
                }
            });
        });
    });
});

// ROTA 3: Atualizar Status do Agendamento (Concluir / Cancelar)
app.patch('/api/agendamentos/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório.' });
    }

    const query = `UPDATE agendamentos SET status = ? WHERE id = ?`;
    db.run(query, [status, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado.' });
        }
        res.json({ message: 'Status atualizado com sucesso!' });
    });
});

// ROTA 4: Limpar Agendamentos de uma data específica
app.delete('/api/agendamentos/limpar', (req, res) => {
    const { data } = req.query;

    if (!data) {
        return res.status(400).json({ error: 'Informe a data para limpar.' });
    }

    const query = `DELETE FROM agendamentos WHERE data = ?`;
    db.run(query, [data], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: `Agendamentos do dia ${data} foram apagados.`, deletados: this.changes });
    });
});

// ROTAS DE PÁGINAS (Apontando corretamente para a pasta 'public')
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Aceita tanto /admin quanto /painel
app.get(['/admin', '/painel'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Inicialização do Servidor Express
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});