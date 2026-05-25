import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Hand, Sparkles, X, SlidersHorizontal, Eye, EyeOff, RefreshCw, AlertCircle, Play, Sparkle, Shield, HelpCircle } from 'lucide-react';
import { playSoftNotificationSound } from '../utils';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface SmartCursorProps {
  onClose: () => void;
  isDark?: boolean;
}

export function SmartCursor({ onClose, isDark = false }: SmartCursorProps) {
  const [permissionState, setPermissionState] = useState<'prompt' | 'loading' | 'active' | 'error'>('prompt');
  const [errorMessage, setErrorMessage] = useState('');
  const [handDetected, setHandDetected] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isPipVisible, setIsPipVisible] = useState(true);
  const [sensitivity, setSensitivity] = useState(1.7); // Multiplicador de cursor
  const [smoothing, setSmoothing] = useState(0.8); // Fator de amortecimento
  const [lastAction, setLastAction] = useState<string>('Inicializando...');
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Sistema Híbrido: Neural ou Óptico
  const [activeTrackingMode, setActiveTrackingMode] = useState<'neural' | 'optical'>('neural');
  const [hoverProgress, setHoverProgress] = useState<number>(0);

  // Refs para controle do Loop e Canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Instância do Hands
  const handsRef = useRef<any>(null);

  // Coordenadas suavizadas do cursor
  const cursorCoords = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const wasClickingRef = useRef(false);

  // Coisas para o Tracker Óptico (Fallback Zero-Dependency)
  const prevFrameBuffer = useRef<Uint8ClampedArray | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverTargetRef = useRef<HTMLElement | null>(null);

  // Histórico para detecção de gestos (Swipes)
  const lastWristXRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSwipeTimeRef = useRef<number>(0);

  // Injetar script CDN do MediaPipe Hands dinamicamente com timeout para não travar
  const loadMediaPipe = async (): Promise<boolean> => {
    if ((window as any).Hands) return true;

    return new Promise((resolve) => {
      // Se não carregar em 3.5 segundos, faz o fallback gracioso para o Motor Óptico Local
      const timeoutId = setTimeout(() => {
        console.warn("Loading of MediaPipe Hands CDN timed out. Activating smart optical flow sensor...");
        resolve(false);
      }, 3500);

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
      script.async = true;
      script.onload = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        resolve(false);
      };
      document.head.appendChild(script);
    });
  };

  // Iniciar Câmera e WebRTC
  const startCamera = async () => {
    setPermissionState('loading');
    setErrorMessage('');
    try {
      const loadSuccess = await loadMediaPipe();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(err => console.error("Video play error:", err));
          
          if (loadSuccess && (window as any).Hands) {
            setActiveTrackingMode('neural');
            initializeTracker();
          } else {
            // Entrar em modo óptico ultrarrápido (totalmente local, zero dependências)
            setActiveTrackingMode('motion');
            initializeOpticalTracker();
          }
        };
      }
    } catch (err: any) {
      console.error('Camera Error:', err);
      setPermissionState('error');
      setErrorMessage(err.message || 'Erro de hardware ou permissão negada ao tentar carregar a câmera.');
    }
  };

  // Parar câmera e liberar streams
  const stopAll = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (handsRef.current) {
      try {
        handsRef.current.close();
      } catch (e) {
        console.warn(e);
      }
    }
    if (hoverTimerRef.current) {
      window.clearInterval(hoverTimerRef.current);
    }
  };

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  // Inicializar o detector de Landmarks do MediaPipe Hands
  const initializeTracker = () => {
    if (!(window as any).Hands) {
      initializeOpticalTracker();
      return;
    }

    try {
      const hands = new (window as any).Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      hands.onResults(onResults);
      handsRef.current = hands;

      setPermissionState('active');
      setLastAction('Câmera Ativa [Rede Neural]. Mostre a mão aberta.');

      // Iniciar o loop de processamento de frame
      const processFrame = async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            await hands.send({ image: videoRef.current });
          } catch (err) {
            // Silencioso se der skip frame
          }
        }
        if (permissionState === 'active' && activeTrackingMode === 'neural') {
          requestRef.current = requestAnimationFrame(processFrame);
        }
      };

      requestRef.current = requestAnimationFrame(processFrame);
    } catch (err: any) {
      console.warn("Failing initializing neural, switching to optical tracker...", err);
      initializeOpticalTracker();
    }
  };

  // --- MOTOR ÓPTICO LOCAL (100% SEGURO, ULTRA PERFORMANCE) ---
  const initializeOpticalTracker = () => {
    setActiveTrackingMode('optical');
    setPermissionState('active');
    setLastAction('Câmera Ativa [Sensor Óptico]. Mova a mão para mover o cursor.');

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 160;
    offscreenCanvas.height = 120;
    const offCtx = offscreenCanvas.getContext('2d');

    const processOpticalFrame = () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !offCtx) {
        requestRef.current = requestAnimationFrame(processOpticalFrame);
        return;
      }

      // 1. Desenhar frame menor no offscreen para maximizar os FPS
      offCtx.drawImage(videoRef.current, 0, 0, 160, 120);
      const frameData = offCtx.getImageData(0, 0, 160, 120);
      const pixels = frameData.data;

      if (!prevFrameBuffer.current) {
        prevFrameBuffer.current = new Uint8ClampedArray(pixels.length);
        prevFrameBuffer.current.set(pixels);
        requestRef.current = requestAnimationFrame(processOpticalFrame);
        return;
      }

      const prevPixels = prevFrameBuffer.current;
      let sumX = 0, sumY = 0, motionCount = 0;

      // 2. Analisar diferença de imagem pixel por pixel (Optical Flow) para pegar o centro da maior movimentação
      for (let i = 0; i < pixels.length; i += 16) { // Pula a cada 4 pixels (multiplica velocidade por 4x)
        const rDiff = Math.abs(pixels[i] - prevPixels[i]);
        const gDiff = Math.abs(pixels[i+1] - prevPixels[i+1]);
        const bDiff = Math.abs(pixels[i+2] - prevPixels[i+2]);
        
        // Se a diferença de cor ultrapassar a tolerância do movimento da mão
        if (rDiff + gDiff + bDiff > 75) {
          const pixelIndex = i / 4;
          const px = pixelIndex % 160;
          const py = Math.floor(pixelIndex / 160);
          sumX += px;
          sumY += py;
          motionCount++;
        }
      }

      // Salvar buffer atual
      prevFrameBuffer.current.set(pixels);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Desenhar círculos do radar óptico no canvas
          if (motionCount > 15) {
            ctx.fillStyle = 'rgba(0, 122, 255, 0.2)';
            ctx.beginPath();
            const rawX = (sumX / motionCount);
            const rawY = (sumY / motionCount);
            // Espelhado horizontalmente
            ctx.arc((1 - rawX / 160) * canvas.width, (rawY / 120) * canvas.height, 12, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Se houver movimento expressivo, calcula e reposiciona o cursor
      if (motionCount > 25) {
        setHandDetected(true);

        const normX = 1 - (sumX / motionCount) / 160; // Espelhado para espelhar a própria câmera
        const normY = (sumY / motionCount) / 120;

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const targetX = (normX - 0.5) * sensitivity * screenWidth + (screenWidth / 2);
        const targetY = (normY - 0.5) * sensitivity * screenHeight + (screenHeight / 2);

        const boundedX = Math.max(10, Math.min(screenWidth - 10, targetX));
        const boundedY = Math.max(10, Math.min(screenHeight - 10, targetY));

        const factor = 1 - smoothing;
        const finalX = cursorCoords.current.x * smoothing + boundedX * factor;
        const finalY = cursorCoords.current.y * smoothing + boundedY * factor;

        cursorCoords.current = { x: finalX, y: finalY };

        if (cursorRef.current) {
          cursorRef.current.style.left = `${finalX}px`;
          cursorRef.current.style.top = `${finalY}px`;
        }

        // --- SISTEMA INTELIGENTE DE SELEÇÃO HOVER-AND-CLICK ---
        // Se o cursor estiver em cima de um botão, links ou inputs interativos
        const hoveredElement = document.elementFromPoint(finalX, finalY) as HTMLElement;
        if (hoveredElement && (
          hoveredElement.tagName === 'BUTTON' || 
          hoveredElement.tagName === 'A' || 
          hoveredElement.classList.contains('cursor-pointer') ||
          hoveredElement.closest('button') ||
          hoveredElement.closest('a')
        )) {
          const clickable = (hoveredElement.tagName === 'BUTTON' || hoveredElement.tagName === 'A') 
            ? hoveredElement 
            : (hoveredElement.closest('button') || hoveredElement.closest('a') || hoveredElement) as HTMLElement;

          if (hoverTargetRef.current !== clickable) {
            hoverTargetRef.current = clickable;
            setHoverProgress(0);
            if (hoverTimerRef.current) window.clearInterval(hoverTimerRef.current);

            let progress = 0;
            setLastAction(`Focando elemento clicável...`);
            hoverTimerRef.current = window.setInterval(() => {
              progress += 8;
              if (progress >= 100) {
                progress = 100;
                setHoverProgress(100);
                window.clearInterval(hoverTimerRef.current!);
                hoverTimerRef.current = null;
                dispatchVirtualClick(finalX, finalY);
              } else {
                setHoverProgress(progress);
              }
            }, 80); // Fica parado ~1 segundo sobre o botão para clicar!
          }
        } else {
          // Reseta contagem do clique por hover se mover para longe
          if (hoverTargetRef.current) {
            hoverTargetRef.current = null;
            setHoverProgress(0);
            if (hoverTimerRef.current) {
              window.clearInterval(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
          }
        }

        // --- DETECÇÃO CONTRA AVANÇAR E VOLTAR (SWIPES HORIZONTAIS) ---
        const fakeWrist = { x: normX, y: normY };
        handleSwipeDetection(fakeWrist);
      } else {
        setHandDetected(false);
      }

      requestRef.current = requestAnimationFrame(processOpticalFrame);
    };

    requestRef.current = requestAnimationFrame(processOpticalFrame);
  };

  // Função auxiliar para detecção do gesto de Punho Fechado (Fist)
  const isFistGesture = (landmarks: any[]) => {
    // Distâncias dos dedos (pontas) em relação aos respectivos nós de base (knuckles)
    // Se a maioria das pontas de dedo estiver abaixo dos nós do meio, o punho está fechado.
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    // Nas coordenadas do MediaPipe, Y cresce para baixo do frame.
    // Portanto, se a ponta (Tip) estiver abaixo do PIP (ou seja, Y_tip > Y_pip), o dedo está dobrado.
    const indexFolded = indexTip.y > indexPip.y;
    const middleFolded = middleTip.y > middlePip.y;
    const ringFolded = ringTip.y > ringPip.y;
    const pinkyFolded = pinkyTip.y > pinkyPip.y;

    const foldedCount = (indexFolded ? 1 : 0) + (middleFolded ? 1 : 0) + (ringFolded ? 1 : 0) + (pinkyFolded ? 1 : 0);
    return foldedCount >= 3;
  };

  // Gatilhos específicos de inteligência para gestos swipes rápidos
  const handleSwipeDetection = (wrist: any) => {
    const now = Date.now();
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    if (dt > 0 && lastWristXRef.current !== null) {
      const currX = wrist.x;
      const speedX = (currX - lastWristXRef.current) / dt; // alteração em relação ao tempo

      // Se moveu incrivelmente rápido
      if (Math.abs(speedX) > 0.0016 && now - lastSwipeTimeRef.current > 1200) {
        if (speedX > 0.0016) {
          // Deslizamento p/ esquerda na câmera (ou seja, direita real na tela) -> AVANÇAR
          triggerSwipeAction('right');
          lastSwipeTimeRef.current = now;
        } else {
          // Deslizamento p/ direita na câmera (ou seja, esquerda real na tela) -> VOLTAR
          triggerSwipeAction('left');
          lastSwipeTimeRef.current = now;
        }
      }
    }
    lastWristXRef.current = wrist.x;
  };

  // Função disparada quando um swipe horizontal rápido é detectado
  const triggerSwipeAction = (direction: 'left' | 'right') => {
    playSoftNotificationSound();
    if (direction === 'right') {
      setLastAction('Movimento Rápido ➔ AVANÇAR / ACEITAR');
      // Procura botões úteis na tela ativa para aceitar/prosseguir
      const confirmKeywords = ['aceitar', 'confirmar', 'concluir', 'avançar', 'próximo', 'salvar', 'enviar', 'sim'];
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const btnToClick = buttons.find(b => {
        const txt = (b.textContent || '').toLowerCase().trim();
        return confirmKeywords.some(keyword => txt.includes(keyword));
      });
      if (btnToClick) {
        (btnToClick as HTMLElement).click();
      } else {
        // Fallback de página se não encontrar botão de ação explícito
        window.history.forward();
      }
    } else {
      setLastAction('Movimento Rápido ⬅ VOLTAR / ANTERIOR');
      // Procura botões para voltar/fechar/cancelar
      const cancelKeywords = ['voltar', 'cancelar', 'fechar', 'anterior', 'não', 'limpar'];
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const btnToClick = buttons.find(b => {
        const txt = (b.textContent || '').toLowerCase().trim();
        return cancelKeywords.some(keyword => txt.includes(keyword));
      });
      if (btnToClick) {
        (btnToClick as HTMLElement).click();
      } else {
        window.history.back();
      }
    }
  };

  // Despachar clique virtual seguro
  const dispatchVirtualClick = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y) as HTMLElement;
    if (!element) return;

    setLastAction(`CLIQUE VIRTUAL ➔ [${element.tagName.toLowerCase()}]`);
    playSoftNotificationSound();

    // Adiciona feedback visual imediato
    const ripple = document.createElement('div');
    ripple.className = 'fixed rounded-full border-4 border-[#007AFF] bg-[#007AFF]/25 pointer-events-none z-[10001] animate-ping';
    ripple.style.width = '60px';
    ripple.style.height = '60px';
    ripple.style.left = `${x - 30}px`;
    ripple.style.top = `${y - 30}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);

    // Click trigger real
    element.focus();
    element.click();

    // feedback de escala nos botões HTML clicáveis
    element.classList.add('scale-95', 'opacity-80', 'transition-all');
    setTimeout(() => {
      element.classList.remove('scale-95', 'opacity-80');
    }, 180);
  };

  // Desenho dos landmarks no canvas de sobreposição (Mini PIP)
  const drawSkeletonOnCanvas = (landmarks: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showSkeleton) return;

    // Estilo de brilho cibernético
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0, 122, 255, 0.6)';

    // Conexões de esqueleto clássicas do MediaPipe Hands
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Polegar
      [0, 5], [5, 6], [6, 7], [7, 8], // Indicador
      [5, 9], [9, 10], [10, 11], [11, 12], // Médio
      [9, 13], [13, 14], [14, 15], [15, 16], // Anelar
      [13, 17], [17, 18], [18, 19], [19, 20], // Mindinho
      [0, 17] // Conectar carpo
    ];

    connections.forEach(([p1, p2]) => {
      const pt1 = landmarks[p1];
      const pt2 = landmarks[p2];
      ctx.beginPath();
      // O MediaPipe Hands é espelhado em Y e X, corrigimos o espelhamento de visualização na renderização
      ctx.moveTo((1 - pt1.x) * canvas.width, pt1.y * canvas.height);
      ctx.lineTo((1 - pt2.x) * canvas.width, pt2.y * canvas.height);
      ctx.stroke();
    });

    // Nós de articulação
    ctx.shadowBlur = 0;
    landmarks.forEach((landmark, index) => {
      ctx.fillStyle = index === 8 || index === 4 ? '#E4302C' : '#00C7BE';
      ctx.beginPath();
      ctx.arc((1 - landmark.x) * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // Método callback para tratar os resultados analíticos de IA
  const onResults = (results: any) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      if (handDetected) {
        setHandDetected(false);
        setLastAction('Nenhuma mão detectada. Mostre a mão na câmera');
      }
      return;
    }

    if (!handDetected) {
      setHandDetected(true);
      setLastAction('Mão Rastreada ➔ Cursor Ativado');
    }

    const landmarks = results.multiHandLandmarks[0];

    // Landmark 8: Ponta do Indicador (Controla posição principal)
    // Landmark 4: Ponta do Polegar (Controla pinça para cliques rápidos)
    // Landmark 0: Pulso/Wrist (Rastreia movimentos amplos e swipes rápidos)
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];

    // --- CÁLCULO COORDENADAS DO CURSOR (Suavizado e Calibrado) ---
    // Aumentamos o alcance (calibração) multiplicando pela sensibilidade para alcançar as extremidades da tela com facilidade.
    // O centro relativo da tela é usado para ancorar o movimento calmo.
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Criar uma zona morta central e um multiplicador para calibração anatômica
    const normalizedX = (1 - indexTip.x); // Espelha cursor horizontal para acompanhar natural
    const normalizedY = indexTip.y;

    const targetX = (normalizedX - 0.5) * sensitivity * screenWidth + (screenWidth / 2);
    const targetY = (normalizedY - 0.5) * sensitivity * screenHeight + (screenHeight / 2);

    // Manter cursor estritamente dentro da janela do usuário
    const boundedX = Math.max(10, Math.min(screenWidth - 10, targetX));
    const boundedY = Math.max(10, Math.min(screenHeight - 10, targetY));

    // Aplicar amortecimento físico (low-pass filter) para evitar tremor
    const factor = 1 - smoothing; // Maior amortecimento = menor fator
    const currentX = cursorCoords.current.x * smoothing + boundedX * factor;
    const currentY = cursorCoords.current.y * smoothing + boundedY * factor;

    cursorCoords.current = { x: currentX, y: currentY };

    // Atualiza posição do DOM elemento físico do cursor
    if (cursorRef.current) {
      cursorRef.current.style.left = `${currentX}px`;
      cursorRef.current.style.top = `${currentY}px`;
    }

    // --- DETECÇÃO DE PINÇA RAPIDA (CLIQUE POR DISTANCIA) ---
    const dx = indexTip.x - thumbTip.x;
    const dy = indexTip.y - thumbTip.y;
    const dz = indexTip.z - thumbTip.z;
    const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // --- DETECÇÃO DE PUNHO FECHADO ---
    const fistClosed = isFistGesture(landmarks);

    // O clique é disparado na pinça (dedo indicador encostando no polegar) ou ao fechar a mão inteira
    const clickTriggered = pinchDist < 0.057 || fistClosed;

    if (clickTriggered) {
      if (!wasClickingRef.current) {
        setIsClicking(true);
        wasClickingRef.current = true;
        dispatchVirtualClick(currentX, currentY);
      }
    } else {
      if (wasClickingRef.current) {
        setIsClicking(false);
        wasClickingRef.current = false;
      }
    }

    // --- DETECÇÃO CONTRA AVANÇAR E VOLTAR (SWIPES HORIZONTAIS) ---
    handleSwipeDetection(wrist);

    // --- DESENHO NO SQUELETON CANVAS ---
    drawSkeletonOnCanvas(landmarks);
  };

  return (
    <>
      {/* VIRTUAL CURSOR COM ANIMAÇÃO GENTIL */}
      <AnimatePresence>
        {permissionState === 'active' && (
          <div
            ref={cursorRef}
            className="fixed pointer-events-none rounded-full flex items-center justify-center z-[10000] -translate-x-1/2 -translate-y-1/2 transition-shadow"
            style={{
              width: '40px',
              height: '40px',
              border: isClicking ? '4px solid #FF3B30' : '3px solid #007AFF',
              boxShadow: isClicking 
                ? '0 0 15px rgba(255,59,48,0.8), inset 0 0 10px rgba(255,59,48,0.5)' 
                : '0 0 12px rgba(0,122,255,0.6), inset 0 0 8px rgba(0,122,255,0.3)',
              backgroundColor: isClicking ? 'rgba(255,59,48,0.2)' : 'rgba(0,122,255,0.08)',
              transition: 'border-color 0.1s, background-color 0.1s'
            }}
          >
            {/* Círculo de carregamento de clique automático em Modo Óptico */}
            {activeTrackingMode === 'optical' && hoverProgress > 0 && (
              <svg className="absolute w-[44px] h-[44px] transform -rotate-90 pointer-events-none scale-105">
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  stroke={isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 122, 255, 0.15)"}
                  strokeWidth="3.5"
                  fill="transparent"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  stroke="#34C759"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * hoverProgress) / 100}
                  className="transition-all duration-75 ease-out"
                />
              </svg>
            )}

            {/* Ponto central do alvo */}
            <div 
              className="rounded-full shrink-0" 
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: isClicking ? '#FF3B30' : '#007AFF'
              }}
            />
            {/* Sinalizador orbital para detecção de mão */}
            {handDetected && (
              <span className="absolute animate-ping inline-flex h-full w-full rounded-full bg-blue-400/20 duration-1000"></span>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* PAINEL DE CONTROLE PIP (Webcam e Controle de Gestos) */}
      <div className="fixed bottom-24 left-6 z-[9990] flex flex-col gap-3 max-w-sm w-76 text-left pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          className={cn(
            "rounded-[2.2rem] p-6 border shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex flex-col backdrop-blur-3xl overflow-hidden text-left relative",
            isDark ? "bg-[#161618]/90 border-white/10 text-white" : "bg-white/95 border-gray-150 text-[#1a1b1f]"
          )}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between mb-4 border-b pb-3 border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#007AFF] animate-pulse" />
              <div>
                <h4 className="font-extrabold text-[#1D1D1F] dark:text-white text-xs uppercase tracking-widest leading-none">Cursor Inteligente</h4>
                <p className="text-[9px] font-semibold text-gray-400 mt-1 uppercase tracking-wider">Apoio a Gestos Live</p>
              </div>
            </div>
            <button 
              onClick={() => { stopAll(); onClose(); }}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-gray-400 hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Estado PROMPT - Solicitar Permissão Inicial */}
          {permissionState === 'prompt' && (
            <div className="flex flex-col space-y-4 py-2">
              <div className="p-4 bg-[#007AFF]/5 border border-[#007AFF]/15 rounded-2xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#007AFF] shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-extrabold text-[10px] uppercase tracking-wider text-[#007AFF] mb-1">Processamento Local e Seguro</h5>
                  <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                    O processamento dos gestos é feito **100% no seu navegador**, em tempo real por rede neural, usando WebGL. Suas imagens de vídeo nunca são enviadas para nenhum servidor. Segurança e privacidade à prova de hacks.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs text-gray-400 font-semibold pl-1">
                <p className="flex items-center gap-2 text-[10px]">🖐️ Mão aberta: cria e move o cursor na tela</p>
                <p className="flex items-center gap-2 text-[10px]">👌 Pinça ou fechar o punho: executa clique virtual</p>
                <p className="flex items-center gap-2 text-[10px]">↔ Deslizar rápido p/ lados: Avançar ou Voltar páginas</p>
              </div>

              <button
                onClick={startCamera}
                className="w-full bg-[#007AFF] hover:bg-[#007aff]/90 text-white font-extrabold py-3.5 rounded-2xl transition-all shadow-md shadow-[#007AFF]/10 text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Permitir Câmera & Ativar
              </button>
            </div>
          )}

          {/* Estado LOADING */}
          {permissionState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3.5">
              <RefreshCw className="w-8 h-8 text-[#007AFF] animate-spin" />
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Injetando Bibliotecas</p>
                <p className="text-[10px] text-gray-500 font-semibold mt-1">
                  Baixando modelos de visão computacional da biblioteca neural do MediaPipe...
                </p>
              </div>
            </div>
          )}

          {/* Estado ERROR */}
          {permissionState === 'error' && (
            <div className="flex flex-col space-y-4 py-2">
              <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-extrabold text-[10px] uppercase tracking-wider text-red-500 mb-1">Incompatibilidade ou Erro</h5>
                  <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              </div>

              <button
                onClick={startCamera}
                className="w-full bg-[#1D1D1F] hover:bg-[#2c2c2e] text-white font-extrabold py-3 rounded-xl transition-all font-sans text-xs tracking-widest uppercase cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* Estado ATIVE - Rastreamento Ativo (PIP) */}
          {permissionState === 'active' && (
            <div className="flex flex-col space-y-4">
              
              {/* Webcam PIP Box */}
              {isPipVisible && (
                <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-black/5 dark:border-white/10 bg-black shadow-inner flex items-center justify-center scale-x-100">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ transform: 'scaleX(-1)' }}
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                  />
                  {/* Canvas de esqueleto */}
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={240}
                    className="absolute inset-0 w-full h-full object-cover z-20 pointer-events-none"
                  />

                  {/* Detecções On-Screen Overlay */}
                  <div className="absolute top-2.5 right-2.5 z-30 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full inline-block", handDetected ? "bg-green-500 animate-pulse" : "bg-red-400")} />
                    <span className="text-[8px] font-black uppercase text-white tracking-widest">
                      {handDetected ? "Rastreado" : "Procurando"}
                    </span>
                  </div>
                </div>
              )}

              {/* Feed de Eventos */}
              <div className="p-3 bg-black/5 dark:bg-white/5 rounded-2xl flex items-center gap-2 border border-black/5 dark:border-white/5 text-left">
                <HelpCircle className="w-4 h-4 text-[#007AFF] shrink-0" />
                <p className="text-[10px] text-gray-500 dark:text-gray-300 font-bold truncate leading-relaxed">
                  Log: <span className="font-semibold text-gray-400 dark:text-gray-500">{lastAction}</span>
                </p>
              </div>

              {/* Seletor de Tecnologia / Modo de Rastreamento */}
              <div className="p-1 px-1 bg-black/5 dark:bg-black/20 rounded-2xl flex items-center gap-1 border border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTrackingMode('neural');
                    initializeTracker();
                  }}
                  className={cn(
                    "flex-1 text-[9px] py-2 rounded-xl font-extrabold tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer",
                    activeTrackingMode === 'neural' 
                      ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/10" 
                      : "text-gray-400 hover:text-[#1D1D1F] dark:hover:text-white"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Rede Neural [IA]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTrackingMode('optical');
                    initializeOpticalTracker();
                  }}
                  className={cn(
                    "flex-1 text-[9px] py-2 rounded-xl font-extrabold tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer",
                    activeTrackingMode === 'optical' 
                      ? "bg-[#34C759] text-white shadow-md shadow-[#34C759]/10" 
                      : "text-gray-400 hover:text-[#1D1D1F] dark:hover:text-white"
                  )}
                >
                  <Hand className="w-3.5 h-3.5" />
                  Sensor Óptico [Local]
                </button>
              </div>

              {/* Ajustes de Rastreamento (Calibração) */}
              <div className="space-y-3 border-t pt-3 border-black/5 dark:border-white/5">
                <div className="flex lg:flex-row flex-col justify-between items-start lg:items-center gap-2 select-none">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#1D1D1F] dark:text-white flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#007AFF]" /> Sensibilidade do Alvo
                  </span>
                  <div className="flex items-center gap-2 w-full lg:w-auto">
                    <input 
                      type="range" 
                      min="1.0" 
                      max="3.0" 
                      step="0.1" 
                      value={sensitivity} 
                      onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                      className="w-full lg:w-28 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#007AFF]"
                    />
                    <span className="text-[9px] font-black text-gray-400 w-6 font-mono">{sensitivity}x</span>
                  </div>
                </div>

                <div className="flex lg:flex-row flex-col justify-between items-start lg:items-center gap-2 select-none">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#1D1D1F] dark:text-white flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#007AFF]" /> Filtro de Tremor
                  </span>
                  <div className="flex items-center gap-2 w-full lg:w-auto">
                    <input 
                      type="range" 
                      min="0.4" 
                      max="0.95" 
                      step="0.05" 
                      value={smoothing} 
                      onChange={(e) => setSmoothing(parseFloat(e.target.value))}
                      className="w-full lg:w-28 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#007AFF]"
                    />
                    <span className="text-[9px] font-black text-gray-400 w-6 font-mono">{Math.round(smoothing * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Ações Rápidas de Visualização */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsPipVisible(!isPipVisible)}
                  className="flex-1 text-[10px] font-extrabold tracking-widest uppercase py-2 border rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition px-2.5 flex items-center justify-center gap-1.5 text-gray-400 dark:text-gray-300 cursor-pointer"
                >
                  {isPipVisible ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
                  {isPipVisible ? 'Ocultar Feedback' : 'Mostrar Feedback'}
                </button>

                <button
                  onClick={() => setShowSkeleton(!showSkeleton)}
                  className="flex-1 text-[10px] font-extrabold tracking-widest uppercase py-2 border rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition px-2.5 flex items-center justify-center gap-1.5 text-gray-400 dark:text-gray-300 cursor-pointer"
                >
                  <Sparkle className={cn("w-3.5 h-3.5", showSkeleton ? "text-[#007AFF]" : "text-gray-400")} />
                  {showSkeleton ? 'Ocultar Esqueleto' : 'Desenhar Esqueleto'}
                </button>
              </div>

            </div>
          )}

        </motion.div>
      </div>
    </>
  );
}
