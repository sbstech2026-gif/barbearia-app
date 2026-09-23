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

// Helper de Preços à prova de falhas (Garante R$ 60,00 no Combo)
function extrairPreco(servicoStr) {
    if (!servicoStr) return 0.00;

    // 1. Tenta extrair valor no texto (ex: "R$ 60,00" ou "60.00")
    const match = servicoStr.match(/R\$\s*([\d.,]+)/i);
    if (match) {
        const val = parseFloat(match[1].replace('.', '').replace(',', '.'));
        if (!isNaN(val) && val > 0) return val;
    }

    // 2. Mapeamento direto pelos nomes dos serviços
    const str = servicoStr.toLowerCase();
    if (str.includes('combo') || str.includes('corte + barba')) return 60.00;
    if (str.includes('corte')) return 35.00;
    if (str.includes('barba')) return 30.00;
    if (str.includes('sobrancelha')) return 15.00;

    return 0.00;
}

// ROTA 1: Criar novo agendamento (Tela do Cliente com trava contra agendamento duplo)
app.post('/api/agendamentos', (req, res) => {
    try {
        const { servico, barbeiro, data, horario, cliente, whatsapp } = req.body;

        if (!servico || !barbeiro || !data || !horario || !cliente || !whatsapp) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }

        // Bloqueia duplicados para o mesmo barbeiro no mesmo dia e horário
        const checkQuery = `SELECT id FROM agendamentos WHERE barbeiro = ? AND data = ? AND horario = ? AND (status IS NULL OR status != 'Cancelado')`;
        
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
                return res.json(rows);
            }

            const hojeStr = data || new Date().toISOString().split('T')[0];
            const mesAtualStr = hojeStr.substring(0, 7); // YYYY-MM

            let fatHoje = 0;
            let fatMes = 0;
            const vendasPorBarbeiro = {};
            const contagemServicos = {};

            (allRows || []).forEach(item => {
                const valor = extrairPreco(item.servico);
                const itemData = item.data;

                // Faturamento Hoje (Apenas Concluídos)
                if (itemData === hojeStr && (item.status === 'Concluído' || item.status === 'atendido')) {
                    fatHoje += valor;
                }

                // Faturamento do Mês (Apenas Concluídos)
                if (itemData && itemData.startsWith(mesAtualStr) && (item.status === 'Concluído' || item.status === 'atendido')) {
                    fatMes += valor;

                    if (!vendasPorBarbeiro[item.barbeiro]) {
                        vendasPorBarbeiro[item.barbeiro] = 0;
                    }
                    vendasPorBarbeiro[item.barbeiro] += valor;
                }

                // Serviço Mais Popular (no mês)
                if (itemData && itemData.startsWith(mesAtualStr) && item.status !== 'Cancelado') {
                    const nomeServico = (item.servico || '').split('(')[0].trim();
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

            // Retorna dados para a página
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
        res.json({ success: true, message: 'Status atualizado com sucesso!' });
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

// ROTAS DE PÁGINAS (Apontando para a pasta 'public')
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/admin', '/painel'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Inicialização do Servidor Express
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// ==========================================
// ROTAS ISOLADAS DE GESTÃO DE SERVIÇOS
// ==========================================
const fs = require('fs');
const path = require('path');
const servicosFilePath = path.join(__dirname, 'servicos.json');

// Função auxiliar para ler serviços salvos
function lerServicos() {
    if (!fs.existsSync(servicosFilePath)) {
        // Tabela inicial padrão (caso o arquivo ainda não exista)
        const servicosIniciais = [
            { id: '1', nome: 'Corte de Cabelo', valor: 35.00 },
            { id: '2', nome: 'Barba', valor: 30.00 },
            { id: '3', nome: 'Combo (Corte + Barba)', valor: 60.00 },
            { id: '4', nome: 'Sobrancelha', valor: 15.00 }
        ];
        fs.writeFileSync(servicosFilePath, JSON.stringify(servicosIniciais, null, 2));
        return servicosIniciais;
    }
    return JSON.parse(fs.readFileSync(servicosFilePath, 'utf8'));
}

// 1. Listar Serviços
app.get('/api/servicos', (req, res) => {
    try {
        const servicos = lerServicos();
        res.json(servicos);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar serviços.' });
    }
});

// 2. Cadastrar Novo Serviço
app.post('/api/servicos', (req, res) => {
    try {
        const { nome, valor } = req.body;
        if (!nome || !valor) return res.status(400).json({ error: 'Dados incompletos.' });

        const servicos = lerServicos();
        const novoServico = {
            id: Date.now().toString(),
            nome: nome.trim(),
            valor: parseFloat(valor)
        };

        servicos.push(novoServico);
        fs.writeFileSync(servicosFilePath, JSON.stringify(servicos, null, 2));
        res.status(201).json(novoServico);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar serviço.' });
    }
});

// 3. Excluir Serviço
app.delete('/api/servicos/:id', (req, res) => {
    try {
        const { id } = req.params;
        let servicos = lerServicos();
        servicos = servicos.filter(s => s.id !== id);
        fs.writeFileSync(servicosFilePath, JSON.stringify(servicos, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao remover serviço.' });
    }
});