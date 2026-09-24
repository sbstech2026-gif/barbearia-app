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

// Conectar ao Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Inicialização e Correção Automática de Estrutura do Banco de Dados
db.serialize(() => {
  // Criar tabela se não existir com a estrutura COMPLETA
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      clienteNome TEXT,
      nome TEXT,
      whatsapp TEXT,
      clienteWhatsapp TEXT,
      servico TEXT,
      servicoId INTEGER,
      barbeiro TEXT,
      data TEXT,
      horario TEXT,
      status TEXT DEFAULT 'Agendado',
      preco REAL
    )
  `);

  // Verificar se a tabela existente precisa de atualização de colunas (caso seja um banco antigo)
  db.all("PRAGMA table_info(agendamentos)", [], (err, columns) => {
    if (!err && columns && columns.length > 0) {
      const nomesColunas = columns.map(c => c.name);
      
      // Se a tabela for antiga e não tiver a coluna 'cliente'
      if (!nomesColunas.includes('cliente')) {
        console.log('Tabela antiga de agendamentos detectada. Adequando estrutura...');
        db.run("ALTER TABLE agendamentos ADD COLUMN cliente TEXT", () => {});
      }
      if (!nomesColunas.includes('clienteNome')) db.run("ALTER TABLE agendamentos ADD COLUMN clienteNome TEXT", () => {});
      if (!nomesColunas.includes('nome')) db.run("ALTER TABLE agendamentos ADD COLUMN nome TEXT", () => {});
      if (!nomesColunas.includes('whatsapp')) db.run("ALTER TABLE agendamentos ADD COLUMN whatsapp TEXT", () => {});
      if (!nomesColunas.includes('clienteWhatsapp')) db.run("ALTER TABLE agendamentos ADD COLUMN clienteWhatsapp TEXT", () => {});
      if (!nomesColunas.includes('servico')) db.run("ALTER TABLE agendamentos ADD COLUMN servico TEXT", () => {});
      if (!nomesColunas.includes('servicoId')) db.run("ALTER TABLE agendamentos ADD COLUMN servicoId INTEGER", () => {});
      if (!nomesColunas.includes('barbeiro')) db.run("ALTER TABLE agendamentos ADD COLUMN barbeiro TEXT", () => {});
      if (!nomesColunas.includes('data')) db.run("ALTER TABLE agendamentos ADD COLUMN data TEXT", () => {});
      if (!nomesColunas.includes('horario')) db.run("ALTER TABLE agendamentos ADD COLUMN horario TEXT", () => {});
      if (!nomesColunas.includes('status')) db.run("ALTER TABLE agendamentos ADD COLUMN status TEXT DEFAULT 'Agendado'", () => {});
      if (!nomesColunas.includes('preco')) db.run("ALTER TABLE agendamentos ADD COLUMN preco REAL", () => {});
    }
  });

  // Tabela de serviços
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  // Tabela de profissionais (Barbeiros)
  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);
});

// ==========================================
// ROTAS DA API DE SERVIÇOS
// ==========================================

app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

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

app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Serviço removido com sucesso', deleted: this.changes });
  });
});

// ==========================================
// ROTAS DA API DE PROFISSIONAIS
// ==========================================

app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });
  }

  const nomeFormatado = nome.trim();

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nomeFormatado], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nomeFormatado });
  });
});

app.put('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }

  db.run('UPDATE profissionais SET nome = ? WHERE id = ?', [nome.trim(), id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), updated: this.changes });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profissional removido com sucesso', deleted: this.changes });
  });
});

// ==========================================
// ROTAS DA API DE AGENDAMENTOS
// ==========================================

app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  if (data) {
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
        res.json(rows || []);
      }
    );
  } else {
    db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  }
});

app.post('/api/agendamentos', (req, res) => {
  const {
    cliente, clienteNome, nome,
    whatsapp, clienteWhatsapp,
    servico, servicoNome, servicoId,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco
  } = req.body;

  const valorNome = cliente || clienteNome || nome || 'Cliente';
  const valorWhatsapp = whatsapp || clienteWhatsapp || '';
  const valorServico = servico || servicoNome || 'Serviço';
  const valorServicoId = servicoId || 1;
  const valorBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const valorHorario = horario || hora || '--:--';
  const valorPreco = preco || 0;

  // Primeiro faz a tentativa de inserir na estrutura com fallback flexível
  const sqlInsert = `
    INSERT INTO agendamentos 
    (cliente, clienteNome, nome, whatsapp, clienteWhatsapp, servico, servicoId, barbeiro, data, horario, status, preco)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Agendado', ?)
  `;

  db.run(
    sqlInsert,
    [
      valorNome, valorNome, valorNome,
      valorWhatsapp, valorWhatsapp,
      valorServico, valorServicoId,
      valorBarbeiro,
      data, valorHorario, valorPreco
    ],
    function (err) {
      if (err) {
        // Fallback de segurança se a tabela no Render ainda estiver em estado antigo
        console.warn('Iniciando fallback de inserção:', err.message);
        
        db.run(
          `INSERT INTO agendamentos (servico, barbeiro, data, horario) VALUES (?, ?, ?, ?)`,
          [valorServico, valorBarbeiro, data, valorHorario],
          function (errFallback) {
            if (errFallback) {
              return res.status(500).json({ error: errFallback.message });
            }
            res.json({ id: this.lastID, status: 'Agendado', success: true });
          }
        );
      } else {
        res.json({ id: this.lastID, status: 'Agendado', success: true });
      }
    }
  );
});

const atualizarStatusHandler = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status é obrigatório.' });
  }

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, status, updated: this.changes, success: true });
  });
};

app.put('/api/agendamentos/:id', atualizarStatusHandler);
app.patch('/api/agendamentos/:id/status', atualizarStatusHandler);
app.patch('/api/agendamentos/:id', atualizarStatusHandler);

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

// ==========================================
// ROTA DA API DE ESTATÍSTICAS (Gráficos)
// ==========================================

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

// ==========================================
// ROTAS DE NAVEGAÇÃO DAS PÁGINAS
// ==========================================

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

app.get('/profissionais', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profissionais.html'));
});

app.get('/financeiro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'financeiro.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicializar Servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});