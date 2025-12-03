const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Configuración - REEMPLAZA CON TUS DATOS
const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://support.jhamf.com';
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID || '8';

// Mapeo de opciones a equipos - REEMPLAZA CON TUS IDs DE EQUIPO
const EPS_TEAMS = {
  '1': { name: 'Comfenalco', teamId: 5, label: 'comfenalco' },
  '2': { name: 'Coosalud', teamId: 4, label: 'coosalud' },
  '3': { name: 'SOS', teamId: 3, label: 'sos' },
  '4': { name: 'Salud Total', teamId: 6, label: 'salud-total' },
  '5': { name: 'Particular', teamId: 7, label: 'particular' }
};

// Webhook endpoint
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type } = req.body;

    console.log(`📨 Evento recibido: ${event}, tipo: ${message_type}`);

    // 1. Detectar respuesta del cliente
    if (event === 'message_created' && message_type === 'incoming') {
      await assignToTeam(req.body);
    }

    // 2. Detectar cierre de conversación (solo si lo necesitas)
    if (event === 'conversation_status_changed' && req.body.status === 'resolved') {
      await sendClosingMessage(req.body);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

// Memoria temporal
const assignedConversations = new Set();

// Asignar a equipo según respuesta
async function assignToTeam(data) {
  const conversationId = data.conversation.id;
  const content = data.content?.trim();
  const conversationStatus = data.conversation?.status;

  // ---------------------------------
  // 1. SI YA FUE ASIGNADA EN MEMORIA → IGNORAR
  // ---------------------------------
  if (assignedConversations.has(conversationId)) {
    console.log(`🛑 Conversación ${conversationId} ya procesada. Ignorando.`);
    return;
  }

  // ---------------------------------
  // 2. SI YA TIENE AGENTE ASIGNADO → IGNORAR
  // ---------------------------------
  const assigneeId = data.conversation?.assignee_id;
  if (assigneeId) {
    console.log(`👤 Conversación ${conversationId} ya tiene agente asignado. Ignorando.`);
    assignedConversations.add(conversationId);
    return;
  }

  // ---------------------------------
  // 3. SI YA TIENE EQUIPO ASIGNADO → IGNORAR
  // ---------------------------------
  const teamId = data.conversation?.team?.id;
  if (teamId) {
    console.log(`👥 Conversación ${conversationId} ya tiene equipo asignado (ID: ${teamId}). Ignorando.`);
    assignedConversations.add(conversationId);
    return;
  }

  // ---------------------------------
  // 4. SI YA TIENE ETIQUETA DE EPS → IGNORAR
  // ---------------------------------
  const labels = data.conversation?.labels || [];
  const hasEPSLabel = labels.some(label => 
    ['comfenalco', 'coosalud', 'sos', 'salud-total', 'particular'].includes(label)
  );
  
  if (hasEPSLabel) {
    console.log(`🏷️ Conversación ${conversationId} ya tiene etiqueta de EPS. Ignorando.`);
    assignedConversations.add(conversationId);
    return;
  }

  // ---------------------------------
  // 5. SOLO PROCESAR CONVERSACIONES "PENDING" O "OPEN" SIN ASIGNAR
  // ---------------------------------
  if (conversationStatus !== 'pending' && conversationStatus !== 'open') {
    console.log(`⏭️ Conversación ${conversationId} en estado "${conversationStatus}". Ignorando.`);
    return;
  }

  // Buscar número 1–5
  const option = content?.match(/^[1-5]$/)?.[0];

  // Si NO envió número válido → mostrar menú
  if (!option) {
    await axios.post(
  `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
  {
    content: `🌟 ¡Hola! Bienvenido(a) a Clínica Fidem.
Por favor, digita el numero de tu EPS para una atención personalizada:

1️⃣ Comfenalco
2️⃣ Coosalud
3️⃣ SOS
4️⃣ Salud Total
5️⃣ Particular / Otro`
  },
  { headers: { 'api_access_token': API_KEY } }
);

    return;
  }

  // ---------------------------------
  // 2. ASIGNAR SI EL NÚMERO ES VÁLIDO
  // ---------------------------------
  const team = EPS_TEAMS[option];
  if (!team) return;

  try {
    // Asignar equipo
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      { team_id: team.teamId },
      { headers: { 'api_access_token': API_KEY } }
    );

    // Etiqueta
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
      { labels: [team.label] },
      { headers: { 'api_access_token': API_KEY } }
    );

    // Confirmación
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: `✅ Te hemos conectado con nuestro equipo de ${team.name}. Un agente te atenderá pronto.`
      },
      { headers: { 'api_access_token': API_KEY } }
    );

    // ---------------------------------
    // 3. MARCAR COMO ASIGNADA
    // ---------------------------------
    assignedConversations.add(conversationId);

    console.log(`🎯 Conversación ${conversationId} asignada exitosamente.`);
  } catch (error) {
    console.error("❌ Error asignando equipo:", error.response?.data || error.message);
  }
}

// Mensaje de cierre
async function sendClosingMessage(data) {
  const conversationId = data.conversation.id;

  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    {
      content:
        '¡Gracias por contactar a Clínica Fidem! 🙏 Esperamos haberte ayudado. Si necesitas algo más, no dudes en escribirnos.'
    },
    { headers: { 'api_access_token': API_KEY } }
  );
}

app.listen(3000, () => {
  console.log('✅ Webhook server running on port 3000');
  console.log('📍 Endpoint: POST /chatwoot-webhook');
});
