const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) console.error('Erro ao conectar ao SQLite:', err.message);
  else console.log('Conectado ao banco de dados SQLite.');
});

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
      preco REAL,
      status TEXT DEFAULT 'Agendado'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);
});

// ==========================================
// ROTAS DE SERVIÇOS (CADASTRO, LISTAGEM, EXCLUSÃO)
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

  db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nome, preco], function (err) {
    if (err) {
      console.error('Erro ao inserir serviço:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, nome, preco, success: true });
  });
});

app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Serviço removido.' });
  });
});

// ==========================================
// ROTAS DE PROFISSIONAIS (CADASTRO, LISTAGEM, EXCLUSÃO)
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

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nome], function (err) {
    if (err) {
      console.error('Erro ao inserir profissional:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, nome, success: true });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Profissional removido.' });
  });
});

// ==========================================
// ROTAS DE AGENDAMENTOS E STATUS
// ==========================================
const atualizarStatusDefinitivo = (req, res) => {
  const { id } = req.params;
  const novoStatus = req.body.status || 'Concluido';

  db.all('PRAGMA table_info(agendamentos)', [], (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });

    const nomesColunas = columns.map(c => c.name);
    const camposParaAtualizar = [];
    const valores = [];

    if (nomesColunas.includes('status')) {
      camposParaAtualizar.push('status = ?');
      valores.push(novoStatus);
    }
    if (nomesColunas.includes('situacao')) {
      camposParaAtualizar.push('situacao = ?');
      valores.push(novoStatus);
    }
    if (nomesColunas.includes('estado')) {
      camposParaAtualizar.push('estado = ?');
      valores.push(novoStatus);
    }

    if (camposParaAtualizar.length === 0) {
      camposParaAtualizar.push('status = ?');
      valores.push(novoStatus);
    }

    valores.push(id);
    const sql = `UPDATE agendamentos SET ${camposParaAtualizar.join(', ')} WHERE id = ?`;

    db.run(sql, valores, function (errUpdate) {
      if (errUpdate) {
        console.error('Erro ao atualizar status:', errUpdate.message);
        return res.status(500).json({ error: errUpdate.message });
      }

      res.json({ success: true, id, status: novoStatus, changes: this.changes });
    });
  });
};

app.put('/api/agendamentos/:id', atualizarStatusDefinitivo);
app.patch('/api/agendamentos/:id/status', atualizarStatusDefinitivo);
app.patch('/api/agendamentos/:id', atualizarStatusDefinitivo);

app.post('/api/agendamentos', (req, res) => {
  const body = req.body || {};

  const vNome = body.cliente || body.clienteNome || body.nome || 'Cliente';
  const vWhatsapp = body.whatsapp || body.clienteWhatsapp || '';
  const vServico = body.servico || body.servicoNome || 'Serviço';
  const vBarbeiro = body.barbeiro || body.barbeiroNome || 'Barbeiro';
  const vHorario = body.horario || body.hora || '--:--';
  const vData = body.data || new Date().toISOString().split('T')[0];
  const vPreco = parseFloat(body.preco) || 0;
  const vServicoId = parseInt(body.servicoId, 10) || 1;
  const vStatus = body.status || 'Agendado';

  const valoresPadrao = {
    cliente: vNome, clienteNome: vNome, nome: vNome,
    whatsapp: vWhatsapp, clienteWhatsapp: vWhatsapp,
    servico: vServico, servicoNome: vServico, servicoId: vServicoId,
    barbeiro: vBarbeiro, barbeiroNome: vBarbeiro,
    data: vData, horario: vHorario, hora: vHorario,
    status: vStatus, preco: vPreco
  };

  db.all('PRAGMA table_info(agendamentos)', [], (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });

    const dadosParaInserir = {};
    columns.forEach(col => {
      const nomeColuna = col.name;
      if (nomeColuna === 'id') return;

      if (valoresPadrao.hasOwnProperty(nomeColuna)) {
        dadosParaInserir[nomeColuna] = valoresPadrao[nomeColuna];
      } else {
        if (col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('NUM')) {
          dadosParaInserir[nomeColuna] = 0;
        } else {
          dadosParaInserir[nomeColuna] = '-';
        }
      }
    });

    const chaves = Object.keys(dadosParaInserir);
    const valores = Object.values(dadosParaInserir);
    const placeholders = chaves.map(() => '?').join(', ');

    const sql = `INSERT INTO agendamentos (${chaves.join(', ')}) VALUES (${placeholders})`;

    db.run(sql, valores, function (errInsert) {
      if (errInsert) {
        console.error('Erro ao inserir agendamento:', errInsert.message);
        return res.status(500).json({ error: errInsert.message });
      }
      res.json({ id: this.lastID, status: 'Agendado', success: true });
    });
  });
});

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
// NAVEGAÇÃO DE PÁGINAS
// ==========================================
app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));
app.get('/servicos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'servicos.html')));
app.get('/profissionais', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profissionais.html')));
app.get('/financeiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'financeiro.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});