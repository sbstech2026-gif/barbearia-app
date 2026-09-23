const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para processar JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar / Conectar Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Criar tabela de agendamentos se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    servico TEXT,
    barbeiro TEXT,
    data TEXT,
    horario TEXT,
    status TEXT DEFAULT 'Agendado',
    preco REAL
  )
`);

// --- ROTAS DA API ---

// 1. Listar todos os agendamentos
app.get('/api/agendamentos', (req, res) => {
  db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 2. Criar novo agendamento
app.post('/api/agendamentos', (req, res) => {
  const { cliente, servico, barbeiro, data, horario, preco } = req.body;
  
  const query = `INSERT INTO agendamentos (cliente, servico, barbeiro, data, horario, status, preco) VALUES (?, ?, ?, ?, ?, 'Agendado', ?)`;
  db.run(query, [cliente, servico, barbeiro, data, horario, preco || 0], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, status: 'Agendado' });
  });
});

// 3. Atualizar status de um agendamento (Concluído / Cancelado)
app.put('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ updated: this.changes });
  });
});

// 4. Limpar/Deletar agendamentos
app.delete('/api/agendamentos', (req, res) => {
  db.run('DELETE FROM agendamentos', [], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Agenda limpa com sucesso' });
  });
});

// Redirecionamento da rota raiz para o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});