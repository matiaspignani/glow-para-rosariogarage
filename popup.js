const FEATURES = [
  ["favs", "Favoritos", "Corazón en cada aviso y lista de guardados."],
  ["seen", "Avisos vistos", "Atenúa los que ya abriste y permite ocultarlos."],
  ["sort", "Ordenar el listado", "Por precio, año o kilometraje en la página actual."],
  ["contact", "Barra de contacto", "Precio y WhatsApp siempre a mano en cada aviso."],
  ["ads", "Ocultar banners", "Quita los banners publicitarios del sitio."],
];

const list = document.getElementById("list");
let off = [];

function save() {
  chrome.storage.sync.set({ rgOff: off });
}

function render() {
  list.textContent = "";
  for (const [key, title, hint] of FEATURES) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !off.includes(key);
    box.addEventListener("change", () => {
      off = box.checked ? off.filter((k) => k !== key) : [...off, key];
      save();
    });
    const text = document.createElement("span");
    text.textContent = title;
    const small = document.createElement("small");
    small.textContent = hint;
    text.append(small);
    label.append(box, text);
    list.append(label);
  }
}

chrome.storage.sync.get("rgOff", (r) => {
  off = Array.isArray(r.rgOff) ? r.rgOff : [];
  render();
});
