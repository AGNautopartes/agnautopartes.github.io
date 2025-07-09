// --- SCRIPT.JS COMPLETO CON IA, REGISTRO EN MAKE.COM Y LÓGICA DE FORMULARIO ---
// NOTA: No modificar las integraciones de Make.com ni la lógica del Asistente de IA.

document.addEventListener('DOMContentLoaded', function() {

  // ===================================================
  // Variables globales y selectores
  const form            = document.getElementById('sparePartsForm');
  const logosContainer  = document.getElementById('logos-container');
  const inputMarca      = document.getElementById('marca');
  const selectModelo    = document.getElementById('modelo');
  const selectAnio      = document.getElementById('anio');
  const descripcionTextarea = document.getElementById('descripcion');
  const nombreInput     = document.getElementById('nombre');
  const telefonoInput   = document.getElementById('telefono');
  const btnAssistant    = document.getElementById('btn-assistant-header');
  const btnSendData     = document.getElementById('btn-send-data');
  const progressSteps   = document.querySelectorAll('.progress-step');
  const formSteps       = document.querySelectorAll('.form-step');
  let currentStep       = 0;
  
  // ===================================================
  // Funciones de utilidad para live-data display
  function updateLiveData(field, value) {
    const displayElement = document.getElementById(`display-${field}`);
    if (displayElement) {
      displayElement.querySelector('span').textContent = value;
    }
  }

  // ===================================================
  // Población de logos (marcas) - se asume existe un array `brands` con objetos {id, name, logoUrl}
  function populateLogos() {
    // Ejemplo: brands = [{ id: 'toyota', name: 'Toyota', logoUrl: 'logos/toyota.png' }, ...]
    brands.forEach(brand => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('logo-wrapper');
      wrapper.dataset.brand = brand.id;
      const img = document.createElement('img');
      img.src = brand.logoUrl;
      img.alt = brand.name;
      wrapper.appendChild(img);
      logosContainer.appendChild(wrapper);
      wrapper.addEventListener('click', () => selectBrand(brand));
    });
  }

  // ===================================================
  // Selección de marca
  function selectBrand(brand) {
    inputMarca.value = brand.name;
    updateLiveData('marca', brand.name);
    // Habilitar modelo
    populateModelos(brand.id);
    selectModelo.disabled = false;
    selectModelo.focus();
  }

  // ===================================================
  // Población de modelos según marca
  function populateModelos(brandId) {
    clearSelect(selectModelo);
    const modeloList = modelsByBrand[brandId] || [];
    selectModelo.appendChild(new Option('Seleccione modelo', ''));
    modeloList.forEach(m => selectModelo.appendChild(new Option(m.name, m.name)));
  }

  // ===================================================
  // Población de años según modelo
  function populateAnios() {
    clearSelect(selectAnio);
    selectAnio.appendChild(new Option('Seleccione modelo primero', ''));
  }
  function onModeloChange() {
    const selected = selectModelo.value;
    clearSelect(selectAnio);
    if (selected) {
      const yearList = yearsByModel[selected] || [];
      selectAnio.disabled = false;
      selectAnio.appendChild(new Option('Seleccione año', ''));
      yearList.forEach(y => selectAnio.appendChild(new Option(y, y)));
      updateLiveData('modelo', selected);
    }
  }

  // ===================================================
  // Limpieza de un select
  function clearSelect(selectElement) {
    selectElement.innerHTML = '';
  }

  // ===================================================
  // Navegación entre pasos del formulario
  function showStep(index) {
    formSteps[currentStep].classList.remove('active');
    progressSteps[currentStep].classList.remove('active');
    currentStep = index;
    formSteps[currentStep].classList.add('active');
    progressSteps[currentStep].classList.add('active');
  }

  document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep < formSteps.length - 1) {
        showStep(currentStep + 1);
      }
    });
  });

  document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 0) {
        showStep(currentStep - 1);
      }
    });
  });

  // ===================================================
  // Envío de formulario principal a Make.com
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    // Aquí la lógica existente de Make.com
    submitToMake(form);
  });

  // ===================================================
  // Lógica del Asistente // NO MODIFICAR
  btnAssistant.addEventListener('click', () => openAssistantChat());

  // ===================================================
  // Live-data: actualizaciones en inputs
  selectModelo.addEventListener('change', () => {
    onModeloChange();
    updateLiveData('anio', '');
    updateLiveData('modelo', selectModelo.value);
    updateSendButton();
  });
  selectAnio.addEventListener('change', () => {
    updateLiveData('anio', selectAnio.value);
    updateSendButton();
  });
  descripcionTextarea.addEventListener('input', () => updateLiveData('descripcion', descripcionTextarea.value));
  nombreInput.addEventListener('input', () => updateLiveData('nombre', nombreInput.value));
  telefonoInput.addEventListener('input', () => updateLiveData('telefono', telefonoInput.value));

  // ===================================================
  // Lógica adicional para mostrar botón de envío de datos del vehículo
  function updateSendButton() {
    const marca  = inputMarca.value;
    const modelo = selectModelo.value;
    const anio   = selectAnio.value;
    if (marca && modelo && anio) {
      const mensaje = `Marca: ${marca}\nModelo: ${modelo}\nAño: ${anio}`;
      const numero = '593999115626';
      btnSendData.href = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
      btnSendData.style.display = 'block';
    } else {
      btnSendData.style.display = 'none';
    }
  }
  logosContainer.addEventListener('click', updateSendButton);

  // ===================================================
  // Inicialización al cargar DOM
  populateLogos();
  populateAnios();
  onModeloChange();
  updateSendButton();

});
