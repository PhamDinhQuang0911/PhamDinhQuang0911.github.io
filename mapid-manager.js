import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- 1. CẤU HÌNH (CONFIG) ---
const firebaseConfig = { apiKey: "AIzaSyCqAX3x1MbJ3do7m3EaH9JA4kFuVhlAc78", authDomain: "lms-thitracnghiem.firebaseapp.com", projectId: "lms-thitracnghiem", storageBucket: "lms-thitracnghiem.firebasestorage.app", messagingSenderId: "760187217240", appId: "1:760187217240:web:d043cd5808c349f87a712d" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 2. TRẠNG THÁI (STATE) ---
let mapData = { metadata: [], tree: [] };
let selectedNode = null;
let expandedNodes = new Set(); // Lưu các nhánh đang mở

// --- 3. XỬ LÝ DỮ LIỆU (CORE) ---
function parseMapID(text) {
    const lines = text.split(/\r?\n/);
    const root = [];
    const stack = [];
    const metadata = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (!trimmed.startsWith('-')) { metadata.push(line); return; }
        // Regex bắt: số gạch, mã ID trong [], tên
        const match = line.match(/^(-+)\[(.+?)\]\s*(.*)/);
        if (match) {
            const dashes = match[1].length;
            const level = Math.round((dashes - 1) / 3);
            const node = { id: match[2], name: match[3], level: level, children: [] };
            
            if (level === 0) { 
                root.push(node); stack[0] = node; stack.length = 1; 
            } else { 
                const p = stack[level - 1]; 
                if (p) { p.children.push(node); stack[level] = node; stack.length = level + 1; } 
            }
        }
    });
    return { tree: root, metadata };
}

function generateMapID(data) {
    let output = (data.metadata || []).join('\n') + '\n';
    function traverse(nodes, lvl) {
        if (!nodes) return;
        nodes.forEach(n => {
            output += `${'-'.repeat(1 + lvl * 3)}[${n.id}] ${n.name}\n`;
            if (n.children && n.children.length) traverse(n.children, lvl + 1);
        });
    }
    traverse(data.tree, 0);
    return output;
}

function findPathToNode(nodes, target, currentPath = []) {
    for (let node of nodes) {
        if (node === target) return [...currentPath, node];
        if (node.children && node.children.length > 0) {
            const path = findPathToNode(node.children, target, [...currentPath, node]);
            if (path) return path;
        }
    }
    return null;
}

function countTotalChildren(node) {
    let count = node.children ? node.children.length : 0;
    if (node.children) node.children.forEach(c => count += countTotalChildren(c));
    return count;
}

// --- 4. VẼ GIAO DIỆN (UI RENDER) ---
function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!container) return; // [Safety] Thoát nếu chưa có khung
    
    container.innerHTML = '';
    let totalNodes = 0;

    if (!mapData.tree || mapData.tree.length === 0) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-64 text-gray-300"><i class="fa-solid fa-folder-tree text-5xl mb-3"></i><p>Chưa có dữ liệu</p></div>';
        return;
    }

    // Hàm đệ quy tạo HTML
    function createNodeElement(node, parentPathId = "") {
        totalNodes++;
        // Tạo ID duy nhất cho mỗi node dựa trên đường dẫn cha (để tránh trùng ID con)
        const currentPathId = parentPathId ? `${parentPathId}_${node.id}` : node.id;
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(currentPathId);
        const isSelected = selectedNode === node;

        // 1. Wrapper chứa dòng và con
        const wrapper = document.createElement('div');

        // 2. Dòng hiển thị (Row)
        const row = document.createElement('div');
        row.className = `tree-node flex items-center gap-2 p-1.5 cursor-pointer rounded select-none transition-colors duration-150 ${isSelected ? 'active bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-100 border-l-4 border-transparent'}`;
        
        // 3. Nút mũi tên (Toggle)
        const toggleBtn = document.createElement('span');
        toggleBtn.className = `w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-transform duration-200 cursor-pointer ${isExpanded ? 'rotate-90 text-blue-600' : ''}`;
        toggleBtn.innerHTML = hasChildren ? '<i class="fa-solid fa-caret-right"></i>' : '';
        
        // [FIX QUAN TRỌNG] Sự kiện bấm mũi tên
        toggleBtn.onclick = (e) => {
            e.stopPropagation(); // Chặn click lan ra dòng cha
            if (hasChildren) {
                if (isExpanded) expandedNodes.delete(currentPathId); // Đóng
                else expandedNodes.add(currentPathId); // Mở
                renderTree(); // Vẽ lại để cập nhật trạng thái
            }
        };

        // Icon thư mục/file
        let iconHtml = '<i class="fa-solid fa-circle text-[6px] text-gray-300"></i>';
        if (node.level === 0) iconHtml = '<i class="fa-solid fa-folder text-yellow-500"></i>';
        else if (node.level === 1) iconHtml = '<i class="fa-solid fa-book text-blue-500"></i>';
        else if (node.level === 2) iconHtml = '<i class="fa-solid fa-bookmark text-green-500"></i>';

        // Mã ID (Cho phép sửa)
        const idBadge = document.createElement('span');
        idBadge.className = "font-mono text-xs font-bold text-gray-600 bg-gray-200 px-1.5 rounded min-w-[24px] text-center hover:bg-white hover:border hover:border-blue-400 outline-none";
        idBadge.contentEditable = true;
        idBadge.textContent = node.id;
        idBadge.onclick = e => e.stopPropagation();
        idBadge.onblur = () => { node.id = idBadge.textContent.trim(); updateRightPanel(); };
        idBadge.onkeydown = e => { if(e.key==='Enter') { e.preventDefault(); idBadge.blur(); }};

        // Tên mục (Cho phép sửa)
        const nameSpan = document.createElement('span');
        nameSpan.className = "node-name text-sm flex-1 truncate hover:text-blue-700 outline-none";
        nameSpan.contentEditable = true;
        nameSpan.textContent = node.name;
        nameSpan.onclick = e => e.stopPropagation();
        nameSpan.onblur = () => { node.name = nameSpan.textContent.trim(); updateRightPanel(); };
        nameSpan.onkeydown = e => { if(e.key==='Enter') { e.preventDefault(); nameSpan.blur(); }};

        // Nút thêm con (+)
        const addBtn = document.createElement('button');
        addBtn.className = "w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-green-600 hover:bg-green-100 opacity-0 group-hover:opacity-100 transition-all";
        addBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
        addBtn.title = "Thêm mục con";
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (!node.children) node.children = [];
            node.children.push({ id: "?", name: "Mục mới", level: node.level + 1, children: [] });
            expandedNodes.add(currentPathId); // Tự động mở để thấy con mới
            renderTree();
        };

        // Gắn sự kiện chọn dòng
        row.onclick = () => {
            selectedNode = node;
            renderTree();
            updateRightPanel();
        };

        row.classList.add('group'); // Kích hoạt hover CSS
        row.append(toggleBtn);
        const iconDiv = document.createElement('div'); iconDiv.className = "w-5 text-center"; iconDiv.innerHTML = iconHtml; row.append(iconDiv);
        row.append(idBadge, nameSpan, addBtn);
        wrapper.appendChild(row);

        // 4. Render con (Nếu đang mở)
        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = "pl-6 border-l border-dashed border-gray-300 ml-3"; // Thụt lề
            node.children.forEach(child => {
                childContainer.appendChild(createNodeElement(child, currentPathId));
            });
            wrapper.appendChild(childContainer);
        }

        return wrapper;
    }

    // Bắt đầu vẽ từ root
    mapData.tree.forEach(node => container.appendChild(createNodeElement(node)));

    // [Safety] Cập nhật số lượng (nếu có element)
    const badge = document.getElementById('nodeCountBadge');
    if (badge) badge.innerText = `${totalNodes} mục`;
}

function updateRightPanel() {
    // [Safety] Kiểm tra các phần tử UI trước khi thao tác
    const infoPanel = document.getElementById('infoPanel');
    const infoEmpty = document.getElementById('infoEmpty');
    const statPanel = document.getElementById('statPanel');
    
    if (!infoPanel || !infoEmpty || !statPanel) return;

    if (!selectedNode) {
        infoPanel.classList.add('hidden');
        statPanel.classList.add('hidden');
        infoEmpty.classList.remove('hidden');
        return;
    }

    infoPanel.classList.remove('hidden');
    statPanel.classList.remove('hidden');
    infoEmpty.classList.add('hidden');

    const path = findPathToNode(mapData.tree, selectedNode);
    if (path) {
        const pathContainer = document.getElementById('pathContainer');
        if (pathContainer) {
            pathContainer.innerHTML = '';
            // Ghép ID: Nối các mã lại với nhau
            document.getElementById('previewID').innerText = path.map(n => n.id).join('');
            
            path.forEach((p, idx) => {
                const div = document.createElement('div');
                div.className = "flex items-start gap-3 text-sm";
                div.innerHTML = `
                    <div class="flex flex-col items-center">
                        <span class="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></span>
                        ${idx < path.length - 1 ? '<div class="w-0.5 h-full bg-gray-200 my-1"></div>' : ''}
                    </div>
                    <div>
                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cấp ${p.level}</span>
                        <div class="font-bold text-gray-800">${p.name}</div>
                        <div class="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-blue-100">Mã: ${p.id}</div>
                    </div>
                `;
                pathContainer.appendChild(div);
            });
        }
    }

    const elDirect = document.getElementById('statDirectChild');
    const elTotal = document.getElementById('statTotalChild');
    if (elDirect) elDirect.innerText = selectedNode.children ? selectedNode.children.length : 0;
    if (elTotal) elTotal.innerText = countTotalChildren(selectedNode);
}

// --- 5. SỰ KIỆN (EVENTS) ---
document.addEventListener('DOMContentLoaded', () => {
    // [Safety] Kiểm tra từng nút trước khi gán sự kiện
    const btnImport = document.getElementById('btnImport');
    if (btnImport) btnImport.addEventListener('click', () => document.getElementById('fileInput').click());

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                mapData = parseMapID(evt.target.result);
                expandedNodes.clear();
                renderTree();
                showToast('Đã nhập file thành công!');
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    const btnExport = document.getElementById('btnExport');
    if (btnExport) btnExport.addEventListener('click', () => {
        const text = generateMapID(mapData);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MapID_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    const btnSave = document.getElementById('btnSave');
    if (btnSave) btnSave.addEventListener('click', async () => {
        const oldText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            await setDoc(doc(db, "configurations", "map_id_tree"), {
                metadata: mapData.metadata,
                tree: JSON.parse(JSON.stringify(mapData.tree)),
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
            });
            showToast('Đã lưu cấu hình lên Server!');
        } catch (e) {
            console.error(e);
            alert("Lỗi lưu (Có thể do quyền hạn): " + e.message);
        } finally {
            btnSave.innerHTML = oldText;
        }
    });

    const btnDel = document.getElementById('btnDeleteNode');
    if (btnDel) btnDel.addEventListener('click', () => {
        if (!selectedNode) return;
        if (!confirm(`Xóa mục "${selectedNode.name}" và toàn bộ con?`)) return;

        function removeNode(nodes, target) {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i] === target) {
                    nodes.splice(i, 1);
                    return true;
                }
                if (nodes[i].children && removeNode(nodes[i].children, target)) return true;
            }
            return false;
        }

        removeNode(mapData.tree, selectedNode);
        selectedNode = null;
        renderTree();
        updateRightPanel();
        showToast('Đã xóa mục!');
    });
});

// Load dữ liệu khi vào trang
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "configurations", "map_id_tree"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                mapData.tree = data.tree || [];
                mapData.metadata = data.metadata || [];
                renderTree();
            }
        } catch(e) { console.log(e); }
    } else {
        window.location.href = 'index.html';
    }
});

// Hàm thông báo
function showToast(msg) {
    const t = document.getElementById('toast');
    if (t) {
        const msgEl = document.getElementById('toastMsg');
        if(msgEl) msgEl.innerText = msg;
        t.classList.remove('translate-x-full');
        setTimeout(() => t.classList.add('translate-x-full'), 3000);
    }
}
