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

// Criar tabelas e garantir que todas as colunas necessárias existam
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      whatsapp TEXT,
      servico TEXT,
      barbeiro TEXT,
      data TEXT,
      horario TEXT,
      status TEXT DEFAULT 'Agendado',
      preco REAL
    )
  `);

  // Garante que colunas adicionadas recentemente existam no banco do Render sem quebrar dados existentes
  db.run(`ALTER TABLE agendamentos ADD COLUMN cliente TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN whatsapp TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN preco REAL`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);
});

// --- ROTAS DA API DE AGENDAMENTOS ---

// 1. Listar todos os agendamentos (suporta filtro opcional por data ?data=YYYY-MM-DD ou DD/MM/YYYY)
app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  if (data) {
    // Se a data veio em formato YYYY-MM-DD, cria a versão DD/MM/YYYY para comparar
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    db.all(
      'SELECT * FROM agendamentos WHERE data = ? OR data = ? ORDER BY horario ASC',
      [data, dataBR],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  } else {
    db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// 2. Criar novo agendamento (suporta múltiplos nomes de campos vindos do formulário)
app.post('/api/agendamentos', (req, res) => {
  const {
    cliente, clienteNome, nome,
    whatsapp, clienteWhatsapp,
    servico, servicoNome,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco
  } = req.body;

  const nomeCliente = cliente || clienteNome || nome || 'Cliente';
  const telWhatsapp = whatsapp || clienteWhatsapp || '';
  const nomeServico = servico || servicoNome || 'Serviço';
  const nomeBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const horaAgendamento = horario || hora || '--:--';

  const query = `
    INSERT INTO agendamentos (cliente, whatsapp, servico, barbeiro, data, horario, status, preco)
    VALUES (?, ?, ?, ?, ?, ?, 'Agendado', ?)
  `;

  db.run(
    query,
    [nomeCliente, telWhatsapp, nomeServico, nomeBarbeiro, data, horaAgendamento, preco || 0],
    function (err) {
      if (err) {
        console.error('Erro ao inserir agendamento:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, status: 'Agendado', success: true });
    }
  );
});

// 3. Atualizar status de um agendamento (Suporta PUT e PATCH)
const atualizarStatusHandler = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status é obrigatório.' });
  }

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id, status, updated: this.changes, success: true });
  });
};

app.put('/api/agendamentos/:id', atualizarStatusHandler);
app.patch('/api/agendamentos/:id/status', atualizarStatusHandler);
app.patch('/api/agendamentos/:id', atualizarStatusHandler);

// 4. Limpar/Deletar agendamentos (geral ou por data)
app.delete('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  if (data) {
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    db.run('DELETE FROM agendamentos WHERE data = ? OR data = ?', [data, dataBR], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agendamentos da data removidos com sucesso', deleted: this.changes });
    });
  } else {
    db.run('DELETE FROM agendamentos', [], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agenda limpa com sucesso' });
    });
  }
});

// --- ROTAS DA API DE SERVIÇOS ---

// 1. Listar todos os serviços
app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 2. Criar ou atualizar serviço
app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  const nomeFormatado = nome.trim();

  db.get('SELECT * FROM servicos WHERE LOWER(nome) = LOWER(?)', [nomeFormatado], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      db.run('UPDATE servicos SET preco = ? WHERE id = ?', [preco, row.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: row.id, nome: row.nome, preco, updated: true });
      });
    } else {
      db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nomeFormatado, preco], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, nome: nomeFormatado, preco });
      });
    }
  });
});

// 3. Atualizar serviço por ID
app.put('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('UPDATE servicos SET nome = ?, preco = ? WHERE id = ?', [nome.trim(), preco, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), preco, updated: this.changes });
  });
});

// 4. Excluir um serviço por ID
app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Serviço removido com sucesso', deleted: this.changes });
  });
});

// --- ROTA DE REINICIALIZAÇÃO DO BANCO (RESET) ---
app.get('/reset-db', (req, res) => {
  const fs = require('fs');
  db.close(() => {
    if (fs.existsSync('./barbearia.db')) {
      fs.unlinkSync('./barbearia.db');
    }
    res.send('Banco de dados zerado com sucesso! Reinicie o servidor para recriar as tabelas.');
  });
});

// --- ROTAS DE PÁGINAS ---

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

// Redirecionamento padrão para o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});