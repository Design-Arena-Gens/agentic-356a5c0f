"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function useAudioSax(durationSec: number, bpm: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const isPlayingRef = useRef(false);
  const stopFnsRef = useRef<(() => void)[]>([]);

  const setup = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const destination = ctx.createMediaStreamDestination();
    ctxRef.current = ctx;
    destRef.current = destination;
  }, []);

  const getStream = useCallback(() => destRef.current?.stream ?? null, []);

  const stop = useCallback(() => {
    stopFnsRef.current.forEach((fn) => fn());
    stopFnsRef.current = [];
    isPlayingRef.current = false;
  }, []);

  const play = useCallback(() => {
    setup();
    const ctx = ctxRef.current!;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(destRef.current!);

    // Simple sax-like patch: saw -> lowpass -> mild distortion -> reverb-ish delay
    const reverbDelay = ctx.createDelay();
    reverbDelay.delayTime.value = 0.18;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.18;
    reverbDelay.connect(reverbGain).connect(masterGain);

    // Backing pad
    const pad = ctx.createOscillator();
    pad.type = "triangle";
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    pad.connect(padGain).connect(masterGain);
    pad.start();

    const endAt = ctx.currentTime + durationSec + 0.3;
    pad.stop(endAt);

    // Melody notes (C minor vibe)
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const baseFreq = 261.63; // C4
    const beat = 60 / bpm;

    const events: Array<{ t: number; midiOffset: number; len: number }> = [];
    let t = 0;
    for (let bar = 0; bar < Math.ceil((durationSec / (beat * 4))); bar++) {
      events.push({ t, midiOffset: 0, len: beat * 1.5 });
      t += beat;
      events.push({ t, midiOffset: 7, len: beat * 0.5 });
      t += beat;
      events.push({ t, midiOffset: 10, len: beat * 1 });
      t += beat;
      events.push({ t, midiOffset: 5, len: beat * 1 });
      t += beat;
    }

    const noteStops: (() => void)[] = [];

    function scheduleNote(atTime: number, midiOffset: number, length: number) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.9;

      // Pitch with slight vibrato
      const freq = baseFreq * Math.pow(2, (scale[midiOffset % scale.length] + 12) / 12);
      const vibrato = ctx.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.value = 5.2;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 6; // cents-ish
      vibrato.connect(vibratoGain).connect(filter.frequency);

      osc.frequency.setValueAtTime(freq, atTime);
      gain.gain.setValueAtTime(0.0001, atTime);
      gain.gain.exponentialRampToValueAtTime(0.35, atTime + 0.03);
      const end = atTime + length;
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      gain.connect(reverbDelay);

      vibrato.start(atTime);
      vibrato.stop(end + 0.05);
      osc.start(atTime);
      osc.stop(end + 0.05);

      noteStops.push(() => {
        try { osc.stop(); } catch {}
        try { vibrato.stop(); } catch {}
      });
    }

    const startAt = ctx.currentTime + 0.05;
    events.forEach((e) => scheduleNote(startAt + e.t, e.midiOffset, e.len));

    stopFnsRef.current.push(() => {
      try { pad.stop(); } catch {}
      masterGain.disconnect();
      reverbDelay.disconnect();
      reverbGain.disconnect();
      noteStops.forEach((fn) => fn());
    });

    isPlayingRef.current = true;
  }, [durationSec, bpm, setup]);

  return { setup, play, stop, getStream };
}

function drawCatFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);

  // Background stage
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#0b1222");
  grd.addColorStop(1, "#0a0f1a");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Spotlight
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const spotX = w * 0.55;
  const spotY = h * -0.05;
  const spotR = Math.max(w, h) * 0.9;
  const radial = ctx.createRadialGradient(spotX, spotY, 10, spotX, spotY, spotR);
  radial.addColorStop(0, "rgba(255,240,200,0.35)");
  radial.addColorStop(1, "rgba(255,240,200,0.0)");
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(spotX, spotY, spotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stage floor
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, h * 0.75, w, h * 0.25);

  // Music notes particles
  for (let i = 0; i < 24; i++) {
    const p = (t * 0.25 + i * 0.12) % 1;
    const alpha = 1 - p;
    const x = w * (0.2 + ((i * 53) % 60) / 100);
    const y = h * (0.72 - p * 0.55) + Math.sin(t * 4 + i) * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3 + i) * 0.2);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = i % 2 ? "#60a5fa" : "#f59e0b";
    ctx.font = "18px serif";
    ctx.fillText(i % 3 === 0 ? "?" : i % 3 === 1 ? "?" : "?", 0, 0);
    ctx.restore();
  }

  // Cat body parameters
  const catX = w * 0.45;
  const catY = h * 0.62;
  const scale = Math.min(w, h) / 480;
  const bob = Math.sin(t * 2.5) * 4 * scale;

  ctx.save();
  ctx.translate(catX, catY + bob);
  ctx.scale(scale, scale);

  // Body
  ctx.fillStyle = "#e5e7eb";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 80, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.save();
  ctx.translate(-10, -80);
  ctx.rotate(Math.sin(t * 2) * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears
  ctx.beginPath();
  ctx.moveTo(-35, -30);
  ctx.lineTo(-60, -70);
  ctx.lineTo(-10, -40);
  ctx.closePath();
  ctx.fillStyle = "#e5e7eb";
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(35, -30);
  ctx.lineTo(60, -70);
  ctx.lineTo(10, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Face
  ctx.fillStyle = "#111827";
  ctx.beginPath(); ctx.arc(-12, -6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath(); ctx.arc(0, 8, 6, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  for (let side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(10 * side, 12); ctx.lineTo(40 * side, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10 * side, 16); ctx.lineTo(40 * side, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10 * side, 20); ctx.lineTo(40 * side, 28); ctx.stroke();
  }

  ctx.restore();

  // Saxophone
  ctx.save();
  ctx.translate(30, -10);
  ctx.rotate(-0.2 + Math.sin(t * 3) * 0.04);
  ctx.fillStyle = "#f59e0b";
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.quadraticCurveTo(50, -50, 70, 0);
  ctx.lineTo(80, 20);
  ctx.quadraticCurveTo(60, 35, 40, 25);
  ctx.lineTo(30, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // keys
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(20 + i * 14, 2 + Math.sin(t * 10 + i) * 1.5, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fde68a";
    ctx.fill();
  }
  ctx.restore();

  // Arms (right paw moving)
  ctx.strokeStyle = "#111827";
  ctx.fillStyle = "#e5e7eb";
  ctx.lineWidth = 4;

  // Left arm
  ctx.beginPath();
  ctx.moveTo(catX - 20, catY - 20 + bob);
  ctx.quadraticCurveTo(catX + 10, catY + 10 + bob, catX + 26, catY - 6 + bob);
  ctx.stroke();

  // Right arm animated
  const paw = Math.sin(t * 6) * 10;
  ctx.beginPath();
  ctx.moveTo(catX - 15, catY - 10 + bob);
  ctx.quadraticCurveTo(catX + 10, catY + 20 + paw + bob, catX + 34, catY - 2 + paw + bob);
  ctx.stroke();

  // Tail
  ctx.beginPath();
  ctx.moveTo(catX - 60, catY + 20 + bob);
  ctx.quadraticCurveTo(catX - 100, catY - 10 + bob, catX - 60, catY - 20 + bob);
  ctx.stroke();

  // Stage lights glint on sax
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 8);
  ctx.fillStyle = "#fff";
  ctx.translate(catX + 60, catY - 20 + bob);
  ctx.rotate(0.4);
  ctx.fillRect(-30, -2, 60, 4);
  ctx.restore();
}

function useCanvasRecorder(width: number, height: number, fps: number, getAudioStream: () => MediaStream | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (startTsRef.current === null) startTsRef.current = ts;
    const t = (ts - startTsRef.current) / 1000;
    drawCatFrame(ctx, t, width, height);
    rafRef.current = requestAnimationFrame(draw);
  }, [width, height]);

  const startPreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTsRef.current = null;
    setIsPreviewing(true);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const stopPreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPreviewing(false);
  }, []);

  const record = useCallback(async (seconds: number) => {
    setBlob(null);
    const canvas = canvasRef.current!;
    const stream = canvas.captureStream(fps);
    const audioStream = getAudioStream();
    if (audioStream) {
      audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      setBlob(blob);
      setIsRecording(false);
    };

    setIsRecording(true);
    startPreview();
    mr.start(Math.max(1000 / fps, 100));

    await new Promise((res) => setTimeout(res, seconds * 1000));
    mr.stop();
    stopPreview();
  }, [fps, getAudioStream, startPreview, stopPreview]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  const downloadUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  return { canvasRef, startPreview, stopPreview, isPreviewing, isRecording, record, blob, downloadUrl };
}

export default function Page() {
  const DURATION = 8; // seconds
  const FPS = 60;
  const WIDTH = 800;
  const HEIGHT = 600;
  const { setup, play, stop, getStream } = useAudioSax(DURATION, 96);
  const { canvasRef, startPreview, stopPreview, isPreviewing, isRecording, record, downloadUrl } = useCanvasRecorder(WIDTH, HEIGHT, FPS, () => getStream());

  const onPreview = useCallback(() => {
    setup();
    play();
    startPreview();
  }, [setup, play, startPreview]);

  const onStopPreview = useCallback(() => {
    stopPreview();
    stop();
  }, [stopPreview, stop]);

  const onRecord = useCallback(async () => {
    setup();
    play();
    await record(DURATION);
    stop();
  }, [setup, play, record, stop]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">Chat Saxo ??</div>
          <div className="subtitle">G?n?rez une vid?o d'un chat qui joue du saxophone (WebM)</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="controls">
          {!isPreviewing && !isRecording && (
            <button onClick={onPreview}>Pr?visualiser</button>
          )}
          {isPreviewing && !isRecording && (
            <button className="secondary" onClick={onStopPreview}>Arr?ter la pr?visualisation</button>
          )}
          {!isRecording && (
            <button onClick={onRecord}>Enregistrer la vid?o ({DURATION}s)</button>
          )}
          {isRecording && (
            <button className="ghost" disabled>Enregistrement en cours?</button>
          )}
          <small className="preview-note">Conseil: Chrome/Firefox recommand?s pour l'enregistrement WebM + audio</small>
        </div>

        <div className="canvas-wrap">
          <span className="badge">{WIDTH}?{HEIGHT} @ {FPS}fps</span>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>

        <div style={{ marginTop: 14 }}>
          {downloadUrl ? (
            <a className="button download" href={downloadUrl} download={`chat-saxo-${Date.now()}.webm`}>
              T?l?charger la vid?o
            </a>
          ) : (
            <span className="footer">La vid?o appara?tra ici apr?s l'enregistrement.</span>
          )}
        </div>
      </div>

      <div className="footer">100% c?t? client. Aucun fichier n'est envoy? au serveur.</div>
    </div>
  );
}
