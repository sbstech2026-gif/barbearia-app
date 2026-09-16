const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização do Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
    }
});

// Criação da tabela com a estrutura compatível
db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        servico TEXT NOT NULL,
        barbeiro TEXT NOT NULL,
        data TEXT NOT NULL,
        horario TEXT NOT NULL,
        preco REAL,
        status TEXT DEFAULT 'Pendente',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// ROTA 1: Criar novo agendamento (Cliente)
app.post('/api/agendamentos', (req, res) => {
    const { cliente, whatsapp, servico, barbeiro, data, horario, preco, status } = req.body;

    const sql = `
        INSERT INTO agendamentos (cliente, whatsapp, servico, barbeiro, data, horario, preco, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        cliente, 
        whatsapp, 
        servico, 
        barbeiro, 
        data, 
        horario, 
        preco || 0, 
        status || 'Pendente'
    ];

    db.run(sql, params, function (err) {
        if (err) {
            console.error('Erro ao inserir agendamento:', err.message);
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        res.json({ sucesso: true, id: this.lastID });
    });
});

// ROTA 2: Listar agendamentos para o Painel Admin
app.get('/api/agendamentos', (req, res) => {
    const { data } = req.query;
    let sql = `SELECT * FROM agendamentos ORDER BY horario ASC`;
    let params = [];

    if (data) {
        sql = `SELECT * FROM agendamentos WHERE data = ? ORDER BY horario ASC`;
        params = [data];
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar agendamentos:', err.message);
            return res.status(500).json({ erro: err.message });
        }
        res.json(rows);
    });
});

// ROTA 3: Limpar agendamentos de teste
app.post('/api/limpar-testes', (req, res) => {
    const sql = `DELETE FROM agendamentos WHERE cliente LIKE '%Teste%' OR cliente LIKE '%SANDRO%' OR whatsapp LIKE '%12345%'`;
    
    db.run(sql, [], function (err) {
        if (err) {
            return res.status(500).json({ erro: err.message });
        }
        res.json({ mensagem: 'Agendamentos de teste removidos com sucesso!', removidos: this.changes });
    });
});

// Inicialização do Servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});