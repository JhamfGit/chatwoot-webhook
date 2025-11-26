const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Configuración - REEMPLAZA CON TUS DATOS
const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://atencion.vitalia.jhamf.com/';
const API_KEY = process.env.API_KEY; // Lo configurarás en Railway
const ACCOUNT_ID = process.env.ACCOUNT_ID || '1';

// Mapeo de opciones a equipos - REEMPLAZA CON TUS IDs DE EQUIPO
const EPS_TEAMS = {
  '1': { name: 'Comfenalco', teamId: 1, label: 'comfenalco' },
  '2': { name: 'Coosalud', teamId: 2, label: 'coosalud' },
  '3': { name: 'SOS', teamId: 3, label: 'sos' },
  '4': { name: 'Salud Total', teamId: 4, label: 'salud-total' },
  '5': { name: 'Particular', teamId: 5, label: 'particular' }
};

// Webhook endpoint
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, conversation, message_type, content } = req.body;

    // 1. Detectar nueva conversación
    if (event === 'conversation_created') {
      await sendWelcomeMessage(req.body);
    }

    // 2. Detectar respuesta del cliente
    if (event === 'message_created' && message_type === 'incoming') {
      await assignToTeam(req.body);
    }

    // 3. Detectar cierre de conversación
    if (event === 'conversation_resolved') {
      await sendClosingMessage(req.body);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

// Enviar mensaje de bienvenida
async function sendWelcomeMessage(data) {
  const conversationId = data.conversation.id;
  
  const message = `🌟 ¡Hola! Bienvenido(a) a Clínica Fidem.

Por favor, selecciona tu EPS para una atención personalizada:

1️⃣ Comfenalco
2️⃣ Coosalud
3️⃣ SOS
4️⃣ Salud Total
5️⃣ Otro / Particular

⏳ Un profesional especializado te atenderá muy pronto.`;

  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content: message },
    { headers: { 'api_access_token': API_KEY } }
  );
}

// Asignar a equipo según respuesta
async function assignToTeam(data) {
  const conversationId = data.conversation.id;
  const content = data.content?.trim();
  
  // Buscar el número en el mensaje (1-5)
  const option = content?.match(/^[1-5]$/)?.[0];
  
  if (option && EPS_TEAMS[option]) {
    const team = EPS_TEAMS[option];
    
    console.log(`🎯 Asignando conversación ${conversationId} a ${team.name}`);
    
    try {
      // 1. Asignar equipo
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
        { team_id: team.teamId },
        { headers: { 'api_access_token': API_KEY } }
      );
      
      // 2. Agregar etiqueta
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
        { labels: [team.label] },
        { headers: { 'api_access_token': API_KEY } }
      );
      
      // 3. Confirmar asignación
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        { content: `✅ Te hemos conectado con nuestro equipo de ${team.name}. Enseguida te atenderán.` },
        { headers: { 'api_access_token': API_KEY } }
      );
      
      console.log(`✅ Asignado exitosamente a ${team.name}`);
    } catch (error) {
      console.error('❌ Error al asignar:', error.response?.data || error.message);
    }
  }
}

// Mensaje de cierre
async function sendClosingMessage(data) {
  const conversationId = data.conversation.id;
  
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content: '¡Gracias por contactar a Clínica Fidem! 🙏 Esperamos haberte ayudado. Si necesitas algo más, no dudes en escribirnos.' },
    { headers: { 'api_access_token': API_KEY } }
  );
}

app.listen(3000, () => {
  console.log('✅ Webhook server running on port 3000');
  console.log('📍 Endpoint: POST /chatwoot-webhook');
});