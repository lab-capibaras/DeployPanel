import React, { useState, useRef } from 'react';
import Starfield from '../components/Starfield';

export default function Deploy() {
  const [formData, setFormData] = useState({
    repoUrl: '',
    branch: '',
    subdomain: ''
  });
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [deploymentState, setDeploymentState] = useState('form'); // 'form', 'progress', 'success', 'error'
  const [deploymentSteps, setDeploymentSteps] = useState({
    clone: { status: 'pending', complete: false },
    build: { status: 'pending', complete: false },
    deploy: { status: 'pending', complete: false }
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [toasts, setToasts] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Iniciando despliegue...');
  const toastIdRef = useRef(0);

  const showToast = (message, type = 'info') => {
    const id = toastIdRef.current++;
    const newToast = { id, message, type };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const parseGithubUrl = (url) => {
    const regex = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;
    const match = url.match(regex);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const loadBranches = async () => {
    if (!formData.repoUrl.trim()) {
      showToast('Por favor ingresa la URL del repositorio', 'warning');
      return;
    }

    const parsed = parseGithubUrl(formData.repoUrl);
    if (!parsed) {
      showToast('URL de GitHub inválida. Usa: github.com/usuario/repo', 'error');
      return;
    }

    setLoadingBranches(true);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches`
      );
      if (!response.ok) throw new Error('No se encontró el repositorio');

      const data = await response.json();
      const branchNames = data.map(branch => branch.name);
      setBranches(branchNames);
      setFormData(prev => ({ ...prev, branch: branchNames[0] || '' }));
      showToast(`Se cargaron ${branchNames.length} ramas exitosamente`, 'success');
    } catch (error) {
      showToast('Error al cargar ramas: ' + error.message, 'error');
    } finally {
      setLoadingBranches(false);
    }
  };

  const activateStep = (step) => {
    setDeploymentSteps(prev => ({
      ...prev,
      [step === 1 ? 'clone' : step === 2 ? 'build' : 'deploy']: { 
        ...prev[step === 1 ? 'clone' : step === 2 ? 'build' : 'deploy'], 
        status: 'active' 
      }
    }));
    const stepNames = ['clone', 'build', 'deploy'];
    setProgress(step * 33.33);
    const messages = [
      'Clonando repositorio desde GitHub...',
      'Construyendo imagen Docker...',
      'Desplegando en Traefik...'
    ];
    setStatusMessage(messages[step - 1]);
  };

  const completeStep = (stepName) => {
    setDeploymentSteps(prev => ({
      ...prev,
      [stepName]: { status: 'complete', complete: true }
    }));
  };

  const deploy = async (e) => {
    e.preventDefault();

    if (!formData.repoUrl.trim() || !formData.subdomain.trim() || !formData.branch) {
      showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    setDeploymentState('progress');
    setDeploymentSteps({
      clone: { status: 'active', complete: false },
      build: { status: 'pending', complete: false },
      deploy: { status: 'pending', complete: false }
    });

    try {
      // Paso 1: Clone
      await new Promise(resolve => setTimeout(resolve, 1500));
      completeStep('clone');

      // Paso 2: Build
      activateStep(2);
      await new Promise(resolve => setTimeout(resolve, 2000));
      completeStep('build');

      // Paso 3: Deploy
      activateStep(3);
      
      // Llamar al endpoint real
      const response = await fetch('/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Error en el despliegue');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      completeStep('deploy');
      setProgress(100);

      const appUrl = `https://${formData.subdomain}.stardest.com`;
      setSuccessUrl(appUrl);
      setDeploymentState('success');
      showToast('¡Despliegue completado!', 'success');
    } catch (error) {
      setErrorMessage(error.message);
      setDeploymentState('error');
      showToast('Error: ' + error.message, 'error');
    }
  };

  const resetForm = () => {
    setFormData({ repoUrl: '', branch: '', subdomain: '' });
    setBranches([]);
    setDeploymentSteps({
      clone: { status: 'pending', complete: false },
      build: { status: 'pending', complete: false },
      deploy: { status: 'pending', complete: false }
    });
    setErrorMessage('');
    setSuccessUrl('');
    setProgress(0);
    setStatusMessage('Iniciando despliegue...');
    setDeploymentState('form');
  };

  const renderStepIcon = (stepName, isComplete, isActive) => {
    if (isComplete) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
      );
    }
    if (isActive) {
      return (
        <div className="w-5 h-5 border-2 border-[#0F2C45] border-t-transparent rounded-full animate-spin"></div>
      );
    }
    return null;
  };

  return (
    <div className="relative min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
      <Starfield />
      <div className="relative w-full max-w-2xl z-10">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">DeployPanel</h1>
          <p className="text-[#CBCDD3] text-sm md:text-base">Panel de despliegue automatizado</p>
        </div>

        {/* Main Card */}
        <div className="bg-[#0f172a]/60 backdrop-blur-md rounded-2xl shadow-2xl border border-[#2F4A67]/30 overflow-hidden">
          
          {/* Form Section */}
          {deploymentState === 'form' && (
            <div className="p-6 md:p-8">
              <form onSubmit={deploy} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#CBCDD3] mb-2">
                    URL del Repositorio GitHub
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="https://github.com/usuario/repo"
                      value={formData.repoUrl}
                      onChange={(e) => setFormData({ ...formData, repoUrl: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[#0b0f19]/50 border border-[#2F4A67]/30 rounded-lg text-white placeholder-[#CBCDD3]/50 focus:outline-none focus:ring-2 focus:ring-[#0F2C45] focus:border-transparent transition duration-200"
                    />
                    <button
                      type="button"
                      onClick={loadBranches}
                      disabled={loadingBranches}
                      className="px-4 py-3 bg-[#2F4A67] hover:bg-[#0F2C45] disabled:bg-[#2F4A67]/50 text-white rounded-lg transition duration-200 whitespace-nowrap font-medium"
                    >
                      {loadingBranches ? 'Cargando...' : 'Cargar Ramas'}
                    </button>
                  </div>
                </div>

                {branches.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-[#CBCDD3] mb-2">
                      Rama del Repositorio
                    </label>
                    <select
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full px-4 py-3 bg-[#0b0f19]/50 border border-[#2F4A67]/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#0F2C45] focus:border-transparent transition duration-200"
                    >
                      {branches.map(branch => (
                        <option key={branch} value={branch}>{branch}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#CBCDD3] mb-2">
                    Subdominio
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      placeholder="mi-app, py, qa-py, etc."
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                      onKeyPress={(e) => e.key === 'Enter' && deploy(e)}
                      className="flex-1 px-4 py-3 bg-[#0b0f19]/50 border border-[#2F4A67]/30 rounded-l-lg text-white placeholder-[#CBCDD3]/50 focus:outline-none focus:ring-2 focus:ring-[#0F2C45] focus:border-transparent transition duration-200"
                    />
                    <span className="px-4 py-3 bg-[#0b0f19]/50 border border-l-0 border-[#2F4A67]/30 rounded-r-lg text-[#CBCDD3] text-sm">
                      .stardest.com
                    </span>
                  </div>
                  <p className="text-xs text-[#CBCDD3]/70 mt-1">Puedes usar cualquier nombre: py, qa-py, dev, mi-app, etc.</p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#0F2C45] to-[#0E2C45] hover:from-[#2F4A67] hover:to-[#0F2C45] text-white font-bold py-4 px-6 rounded-lg transition duration-200 transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  Desplegar Aplicación
                </button>
              </form>
            </div>
          )}

          {/* Progress Section */}
          {deploymentState === 'progress' && (
            <div className="p-6 md:p-8 bg-[#0b0f19]/40">
              <div className="space-y-4">
                {['clone', 'build', 'deploy'].map((stepName, idx) => {
                  const step = deploymentSteps[stepName];
                  const isComplete = step.complete;
                  const isActive = step.status === 'active';
                  
                  return (
                    <div key={stepName} className="flex items-center space-x-4">
                      <glass-element width="40" height="40" radius="20" depth="3" blur="2" strength="30" background-color={isComplete ? "rgba(34, 197, 94, 0.5)" : isActive ? "rgba(15, 44, 69, 0.5)" : "rgba(47, 74, 103, 0.3)"} class={`transition-all duration-500 block ${isActive ? 'animate-pulse' : ''}`}>
                        {renderStepIcon(stepName, isComplete, isActive)}
                      </glass-element>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {stepName === 'clone' ? 'Clonando repositorio' : stepName === 'build' ? 'Construyendo imagen' : 'Desplegando'}
                        </p>
                        <p className="text-[#CBCDD3] text-sm">
                          {stepName === 'clone' ? 'Descargando código fuente...' : stepName === 'build' ? 'Detectando lenguaje y creando contenedor...' : 'Configurando Traefik y lanzando...'}
                        </p>
                      </div>
                    </div>
                  );
                })}

                <div className="mt-6">
                  <div className="bg-[#2F4A67]/30 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-[#0F2C45] to-[#2F4A67] h-full transition-all duration-500" 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                </div>

                <div className="text-center text-[#CBCDD3] text-sm mt-4">{statusMessage}</div>
              </div>
            </div>
          )}

          {/* Success Section */}
          {deploymentState === 'success' && (
            <div className="p-6 md:p-8">
              <div className="text-center space-y-4">
                <glass-element width="80" height="80" radius="40" depth="6" blur="2" strength="30" background-color="rgba(34, 197, 94, 0.5)" class="mx-auto block animate-pulse">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </glass-element>
                <h3 className="text-2xl font-bold text-white">Desplegado Exitosamente</h3>
                <p className="text-[#CBCDD3]">Su aplicación está lista y funcionando</p>
                <div className="pt-4 space-y-3">
                  <a
                    href={successUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 transform hover:scale-105"
                  >
                    Abrir Aplicación
                  </a>
                  <button
                    onClick={resetForm}
                    className="w-full bg-[#2F4A67] hover:bg-[#0F2C45] text-white font-medium py-3 px-6 rounded-lg transition duration-200"
                  >
                    Desplegar Otro Proyecto
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Section */}
          {deploymentState === 'error' && (
            <div className="p-6 md:p-8">
              <div className="text-center space-y-4">
                <glass-element width="80" height="80" radius="40" depth="6" blur="2" strength="30" background-color="rgba(239, 68, 68, 0.5)" class="mx-auto block">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </glass-element>
                <h3 className="text-2xl font-bold text-white">Error en el Despliegue</h3>
                <p className="text-[#CBCDD3]">{errorMessage}</p>
                <button
                  onClick={resetForm}
                  className="w-full bg-[#2F4A67] hover:bg-[#0F2C45] text-white font-medium py-3 px-6 rounded-lg transition duration-200"
                >
                  Intentar de Nuevo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-[#CBCDD3] text-sm">
          <p></p>
        </div>
      </div>

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map(toast => {
          const colors = {
            success: 'from-green-500 to-green-600',
            error: 'from-red-500 to-red-600',
            warning: 'from-yellow-500 to-yellow-600',
            info: 'from-[#0F2C45] to-[#2F4A67]'
          };
          const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
          };
          
          return (
            <div
              key={toast.id}
              className={`bg-gradient-to-r ${colors[toast.type]} text-white px-6 py-4 rounded-lg shadow-lg animate-slide-in-right flex items-center space-x-3 min-w-[300px] max-w-md`}
            >
              <span className="text-2xl">{icons[toast.type]}</span>
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-white hover:text-gray-200 text-xl font-bold"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
