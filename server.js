const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com o SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
    }
});

// Criação da Tabela de Agendamentos
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

// Helper de Preços à prova de falhas
function extrairPreco(servicoStr) {
    if (!servicoStr) return 0.00;

    // 1. Tenta pegar valor no texto (ex: "R$ 60,00" ou "60.00")
    const match = servicoStr.match(/R\$\s*([\d.,]+)/i);
    if (match) {
        const val = parseFloat(match[1].replace('.', '').replace(',', '.'));
        if (!isNaN(val) && val > 0) return val;
    }

    // 2. Mapeamento direto
    const str = servicoStr.toLowerCase();
    if (str.includes('combo') || str.includes('corte + barba')) return 60.00;
    if (str.includes('corte')) return 35.00;
    if (str.includes('barba')) return 30.00;
    if (str.includes('sobrancelha')) return 15.00;

    return 0.00;
}

// ROTA 1: Criar novo agendamento (Tela do Cliente)
app.post('/api/agendamentos', (req, res) => {
    try {
        const { servico, barbeiro, data, horario, cliente, whatsapp } = req.body;

        if (!servico || !barbeiro || !data || !horario || !cliente || !whatsapp) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }

        // Validação de horário ocupado
        const checkQuery = `SELECT id FROM agendamentos WHERE barbeiro = ? AND data = ? AND horario = ? AND status != 'Cancelado'`;
        
        db.get(checkQuery, [barbeiro, data, horario], (err, row) => {
            if (err) {
                console.error('Erro ao verificar disponibilidade:', err);
                return res.status(500).json({ error: 'Erro interno ao validar horário.' });
            }
            if (row) {
                return res.status(400).json({ error: 'Este barbeiro já possui um agendamento para este horário.' });
            }

            // Inserção no banco
            const insertQuery = `
                INSERT INTO agendamentos (servico, barbeiro, data, horario, cliente, whatsapp, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Agendado')
            `;
            
            db.run(insertQuery, [servico, barbeiro, data, horario, cliente, whatsapp], function(err) {
                if (err) {
                    console.error('Erro ao inserir agendamento:', err);
                    return res.status(500).json({ error: 'Erro ao salvar o agendamento no banco.' });
                }
                
                return res.status(201).json({
                    success: true,
                    message: 'Agendamento realizado com sucesso!',
                    id: this.lastID
                });
            });
        });
    } catch (error) {
        console.error('Erro na rota POST /api/agendamentos:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ROTA 2: Buscar agendamentos e calcular KPIs
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

        db.all("SELECT * FROM agendamentos", [], (errAll, allRows) => {
            if (errAll) {
                return res.json(rows);
            }

            const hojeStr = data || new Date().toISOString().split('T')[0];
            const mesAtualStr = hojeStr.substring(0, 7);

            let fatHoje = 0;
            let fatMes = 0;
            const vendasPorBarbeiro = {};
            const contagemServicos = {};

            (allRows || []).forEach(item => {
                const valor = extrairPreco(item.servico);
                const itemData = item.data;

                if (itemData === hojeStr && (item.status === 'Concluído' || item.status === 'atendido')) {
                    fatHoje += valor;
                }

                if (itemData && itemData.startsWith(mesAtualStr) && (item.status === 'Concluído' || item.status === 'atendido')) {
                    fatMes += valor;

                    if (!vendasPorBarbeiro[item.barbeiro]) {
                        vendasPorBarbeiro[item.barbeiro] = 0;
                    }
                    vendasPorBarbeiro[item.barbeiro] += valor;
                }

                if (itemData && itemData.startsWith(mesAtualStr) && item.status !== 'Cancelado') {
                    const nomeServico = (item.servico || '').split('(')[0].trim();
                    contagemServicos[nomeServico] = (contagemServicos[nomeServico] || 0) + 1;
                }
            });

            let barbeiroDestaque = 'Nenhum ainda';
            let maiorVenda = 0;
            for (const [barbeiro, total] of Object.entries(vendasPorBarbeiro)) {
                if (total > maiorVenda) {
                    maiorVenda = total;
                    barbeiroDestaque = barbeiro;
                }
            }

            let servicoPopular = 'Nenhum ainda';
            let maiorQtd = 0;
            for (const [servico, qtd] of Object.entries(contagemServicos)) {
                if (qtd > maiorQtd) {
                    maiorQtd = qtd;
                    servicoPopular = servico;
                }
            }

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

// ROTA 3: Atualizar Status
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
        res.json({ success: true, message: 'Status atualizado com sucesso!' });
    });
});

// ROTA 4: Limpar Agendamentos por Data
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

// ROTAS DE PÁGINAS
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/admin', '/painel'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Inicialização
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});