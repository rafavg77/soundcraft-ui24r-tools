#!/usr/bin/env node

const { SoundcraftUi24R } = require('../lib/ui24r');

const ACTION = process.argv[2] || 'status';
const IP = process.argv[3] || process.env.UI24R_IP || '192.168.100.200';

async function main() {
  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();

    if (ACTION === 'status') {
      console.log(`\n=== ESTADO GRABACIÓN ESTÉREO (2-TRACK) EN USB (${IP}) ===`);
      const isRec = mixer.get('var.isRecording');
      const busy = mixer.get('var.recBusy');
      const fill = mixer.get('var.usbfill') || '0';
      const freespace = mixer.get('var.mtk.freespace');

      console.log(`Estado:           ${isRec === '1' ? '🔴 GRABANDO (Pista Estéreo Master)' : '⏹️ DETENIDO'}`);
      console.log(`Búfer / Escritura: ${busy === '1' ? '⏳ ESCRIBIENDO' : '✅ LIBRE'}`);
      console.log(`Llenado de Búfer:  ${fill}% ${parseFloat(fill) > 70 ? '🚨 ALTO (Riesgo lentitud)' : '✅ NORMAL'}`);
      console.log(`Espacio USB:       ${freespace === '-1' ? '⚠️ NO DETECTADA (Inserta USB en puerto REC frontal)' : freespace}`);
      console.log('---------------------------------------------------------');

    } else if (ACTION === 'toggle' || ACTION === 'start') {
      const isRec = mixer.get('var.isRecording');
      if (ACTION === 'start' && isRec === '1') {
        console.log('⚠️ Ya está grabando una pista estéreo.');
      } else {
        console.log('⏺️ Enviando comando RECTOGGLE a la mezcladora...');
        mixer.send('RECTOGGLE');
        await new Promise((r) => setTimeout(r, 1500));
        const nowRec = mixer.get('var.isRecording');
        console.log(`Estado actual: ${nowRec === '1' ? '🔴 GRABANDO ESTÉREO' : '⏹️ DETENIDO'}`);
      }

    } else if (ACTION === 'stop') {
      const isRec = mixer.get('var.isRecording');
      if (isRec === '0') {
        console.log('⏹️ La grabación estéreo ya estaba detenida.');
      } else {
        console.log('⏹️ Deteniendo grabación estéreo...');
        mixer.send('RECTOGGLE');
        await new Promise((r) => setTimeout(r, 2000));
        console.log('✅ Grabación estéreo detenida.');
      }

    } else {
      console.log('Uso: ui24r-rec-stereo [status | start | stop | toggle] [IP]');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
