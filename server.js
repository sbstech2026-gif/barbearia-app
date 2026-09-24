const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com o Banco de Dados SQLite
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite com sucesso.');
  }
});

// Inicialização das tabelas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT NOT NULL,
      barbeiro TEXT NOT NULL,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,
      preco REAL NOT NULL,
      status TEXT DEFAULT 'Agendado'
    )
  `);
});

// --- ROTAS DA API ---

// 1. Listar todos os agendamentos
app.get('/api/agendamentos', (req, res) => {
  const query = `SELECT * FROM agendamentos ORDER BY data DESC, horario ASC`;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 2. Criar novo agendamento
app.post('/api/agendamentos', (req, res) => {
  const { cliente, telefone, servico, barbeiro, data, horario, preco } = req.body;

  if (!cliente || !telefone || !servico || !barbeiro || !data || !horario || !preco) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  const query = `
    INSERT INTO agendamentos (cliente, telefone, servico, barbeiro, data, horario, preco)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [cliente, telefone, servico, barbeiro, data, horario, preco], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, message: 'Agendamento criado com sucesso!' });
  });
});

// 3. Atualizar status do agendamento
app.patch('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const query = `UPDATE agendamentos SET status = ? WHERE id = ?`;
  db.run(query, [status, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Status atualizado com sucesso!' });
  });
});

// 4. Eliminar agendamento
app.delete('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;

  const query = `DELETE FROM agendamentos WHERE id = ?`;
  db.run(query, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Agendamento removido com sucesso!' });
  });
});

// 5. Endpoint de Estatísticas e Métricas para os Gráficos (NOVO)
app.get('/api/estatisticas', (req, res) => {
  const queries = {
    faturamento: `
      SELECT 
        SUM(CASE WHEN date(data) = date('now') THEN preco ELSE 0 END) as diario,
        SUM(CASE WHEN strftime('%W', data) = strftime('%W', 'now') THEN preco ELSE 0 END) as semanal,
        SUM(CASE WHEN strftime('%m', data) = strftime('%m', 'now') THEN preco ELSE 0 END) as mensal
      FROM agendamentos WHERE status = 'Agendado' OR status = 'Concluído'`,
    horarios: `
      SELECT horario, COUNT(*) as total 
      FROM agendamentos 
      GROUP BY horario 
      ORDER BY total DESC LIMIT 5`,
    servicos: `
      SELECT servico, COUNT(*) as total 
      FROM agendamentos 
      GROUP BY servico 
      ORDER BY total DESC`
  };

  db.get(queries.faturamento, [], (err, fat) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(queries.horarios, [], (err, hor) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(queries.servicos, [], (err, serv) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          faturamento: fat || { diario: 0, semanal: 0, mensal: 0 },
          horarios: hor,
          servicos: serv
        });
      });
    });
  });
});

// Servir o painel de administração
app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`Servidor a rodar na porta ${PORT}`);
});