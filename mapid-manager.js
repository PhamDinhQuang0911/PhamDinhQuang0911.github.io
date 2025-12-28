import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- CONFIG ---
const firebaseConfig = { apiKey: "AIzaSyCqAX3x1MbJ3do7m3EaH9JA4kFuVhlAc78", authDomain: "lms-thitracnghiem.firebaseapp.com", projectId: "lms-thitracnghiem", storageBucket: "lms-thitracnghiem.firebasestorage.app", messagingSenderId: "760187217240", appId: "1:760187217240:web:d043cd5808c349f87a712d" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- STATE ---
let mapData = { metadata: [], tree: [] };
let selectedNode = null;
let expandedNodes = new Set(); // Lưu trạng thái mở rộng của các node (theo ID path)

// --- 1. CORE LOGIC ---

// Parse text -> JSON Tree
function parseMapID(text) {
    const lines = text.split(/\r?\n/);
    const root = [];
    const stack = [];
    const metadata = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (!trimmed.startsWith('-')) { metadata.push(line); return; }

        const match = line.match(/^(-+)\[(.+?)\]\s*(.*)/);
        if (match) {
            const dashes = match[1].length;
            const level = Math.round((dashes - 1) / 3);
            const node = { id: match[2], name: match[3], level: level, children: [] };

            if (level === 0) {
                root.push(node);
                stack[0] = node;
                stack.length = 1;
            } else {
                const parent = stack[level - 1];
                if (parent) {
                    parent.children.push(node);
                    stack[level] = node;
                    stack.length = level + 1;
                }
            }
        }
    });
    return { tree: root, metadata };
}

// Generate JSON -> Text
function generateMapID(data) {
    let output = data.metadata.join('\n') + '\n';
    function traverse(nodes, lvl) {
        if (!nodes) return;
        nodes.forEach(n => {
            output += `${'-'.repeat(1 + lvl * 3)}[${n.id}] ${n.name}\n`;
            if (n.children.length) traverse(n.children, lvl + 1);
        });
    }
    traverse(data.tree, 0);
    return output;
}

// Helper: Tìm path từ root đến node (để hiển thị ID)
function findPathToNode(nodes, target, currentPath = []) {
    for (let node of nodes) {
        if (node === target) return [...currentPath, node];
        if (node.children.length > 0) {
            const path = findPathToNode(node.children, target, [...currentPath, node]);
            if (path) return path;
        }
    }
    return null;
}

// Helper: Đếm tổng số con cháu
function countTotalChildren(node) {
    let count = node.children.length;
    node.children.forEach(child => count += countTotalChildren(child));
    return count;
}

// --- 2. UI RENDERING (SMART TREE) ---

function renderTree() {
    const container = document.getElementById('treeContainer');
    container.innerHTML = '';
    let totalNodes = 0;

    if (mapData.tree.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400">Trống</div>';
        return;
    }

    function createNodeElement(node, parentPathId = "") {
        totalNodes++;
        const currentPathId = parentPathId ? `${parentPathId}_${node.id}` : node.id;
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(currentPathId);
        const isSelected = selectedNode === node;

        // Container chính
        const wrapper = document.createElement('div');

        // Dòng hiển thị Node
        const row = document.createElement('div');
        row.className = `tree-node flex items-center gap-2 p-1.5 cursor-pointer rounded ${isSelected ? 'active' : ''}`;
        row.dataset.path = currentPathId; // Để định danh

        // Nút Toggle (Mũi tên)
        const toggleBtn = document.createElement('span');
        toggleBtn.className = `w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`;
        toggleBtn.innerHTML = hasChildren ? '<i class="fa-solid fa-caret-right"></i>' : '';
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (hasChildren) {
                if (isExpanded) expandedNodes.delete(currentPathId);
                else expandedNodes.add(currentPathId);
                renderTree(); // Re-render để cập nhật trạng thái
            }
        };

        // Icon cấp độ
        let iconHtml = '<i class="fa-solid fa-circle text-[6px] text-gray-300"></i>';
        if (node.level === 0) iconHtml = '<i class="fa-solid fa-folder text-yellow-500"></i>';
        else if (node.level === 1) iconHtml = '<i class="fa-solid fa-book text-blue-500"></i>';
        else if (node.level === 2) iconHtml = '<i class="fa-solid fa-bookmark text-green-500"></i>';

        // Mã ID (Editable)
        const idBadge = document.createElement('span');
        idBadge.className = "font-mono text-xs font-bold text-gray-600 bg-gray-200 px-1.5 rounded min-w-[20px] text-center hover:bg-white hover:border hover:border-blue-300";
        idBadge.contentEditable = true;
        idBadge.textContent = node.id;
        idBadge.onblur = () => { node.id = idBadge.textContent.trim(); updateRightPanel(); };
        idBadge.onkeydown = (e) => { if(e.key==='Enter'){ e.preventDefault(); idBadge.blur(); }};

        // Tên (Editable)
        const nameSpan = document.createElement('span');
        nameSpan.className = "node-name text-sm flex-1 truncate hover:border-b hover:border-dashed hover:border-gray-400";
        nameSpan.contentEditable = true;
        nameSpan.textContent = node.name;
        nameSpan.onblur = () => { node.name = nameSpan.textContent.trim(); updateRightPanel(); };
        nameSpan.onkeydown = (e) => { if(e.key==='Enter'){ e.preventDefault(); nameSpan.blur(); }};

        // Nút thêm nhanh (+)
        const addBtn = document.createElement('button');
        addBtn.className = "opacity-0 group-hover:opacity-100 text-green-600 hover:bg-green-100 w-6 h-6 rounded flex items-center justify-center transition-opacity";
        addBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
        addBtn.title = "Thêm mục con";
        addBtn.onclick = (e) => {
            e.stopPropagation();
            // Thêm node con mới
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

        // CSS Hover cho nút Add
        row.classList.add('group');

        // Lắp ráp Row
        row.appendChild(toggleBtn);
        row.innerHTML += `<div class="w-5 text-center">${iconHtml}</div>`;
        row.appendChild(idBadge);
        row.appendChild(nameSpan);
        row.appendChild(addBtn);

        wrapper.appendChild(row);

        // Render con (nếu đang mở)
        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = "tree-children";
            node.children.forEach(child => {
                childContainer.appendChild(createNodeElement(child, currentPathId));
            });
            wrapper.appendChild(childContainer);
        }

        return wrapper;
    }

    mapData.tree.forEach(node => {
        container.appendChild(createNodeElement(node));
    });

    document.getElementById('nodeCountBadge').textContent = `${totalNodes} mục`;
}

// --- 3. UI: RIGHT PANEL (ID EXPLANATION) ---

function updateRightPanel() {
    const infoPanel = document.getElementById('infoPanel');
    const infoEmpty = document.getElementById('infoEmpty');
    const statPanel = document.getElementById('statPanel');

    if (!selectedNode) {
        infoPanel.classList.add('hidden');
        statPanel.classList.add('hidden');
        infoEmpty.classList.remove('hidden');
        return;
    }

    infoPanel.classList.remove('hidden');
    statPanel.classList.remove('hidden');
    infoEmpty.classList.add('hidden');

    // 1. Dò đường (Path)
    const path = findPathToNode(mapData.tree, selectedNode);
    if (path) {
        const pathContainer = document.getElementById('pathContainer');
        pathContainer.innerHTML = '';
        
        let fullID = "";
        
        path.forEach((p, idx) => {
            fullID += p.id; // Cộng dồn ID (VD: 9 + D + 1...)
            // Nếu là bước cuối có thể thêm gạch nối nếu cần (tùy logic THPT)
            // Ở đây ta cộng dồn đơn giản để demo

            const div = document.createElement('div');
            div.className = "flex items-start gap-3 text-sm";
            div.innerHTML = `
                <div class="flex flex-col items-center">
                    <span class="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></span>
                    ${idx < path.length - 1 ? '<div class="w-0.5 h-full bg-gray-200 my-1"></div>' : ''}
                </div>
                <div>
                    <span class="text-xs font-bold text-gray-400 uppercase">Cấp ${p.level}</span>
                    <div class="font-bold text-gray-800">${p.name}</div>
                    <div class="text-xs font-mono text-blue-600 bg-blue-50 px-1 rounded inline-block">Mã: ${p.id}</div>
                </div>
            `;
            pathContainer.appendChild(div);
        });

        // Hiển thị ID giả định (Lấy các ký tự đầu ghép lại)
        // Lưu ý: Logic ID thực tế có thể phức tạp hơn (VD thêm dấu gạch ngang), ở đây ghép chuỗi để minh họa
        document.getElementById('previewID').innerText = path.map(n => n.id).join('');
    }

    // 2. Thống kê
    document.getElementById('statDirectChild').innerText = selectedNode.children ? selectedNode.children.length : 0;
    document.getElementById('statTotalChild').innerText = countTotalChildren(selectedNode);
}

// --- 4. ACTIONS & EVENTS ---

// Xóa Node
document.getElementById('btnDeleteNode').addEventListener('click', () => {
    if (!selectedNode) return;
    if (!confirm(`Xóa mục "${selectedNode.name}" và toàn bộ con?`)) return;

    function removeNode(nodes, target) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] === target) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (removeNode(nodes[i].children, target)) return true;
            }
        }
        return false;
    }

    removeNode(mapData.tree, selectedNode);
    selectedNode = null;
    renderTree();
    updateRightPanel();
});

// Import
document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        mapData = parseMapID(evt.target.result);
        expandedNodes.clear(); // Reset trạng thái mở rộng khi nhập mới
        renderTree();
        showToast('Đã nhập dữ liệu thành công!');
        e.target.value = '';
    };
    reader.readAsText(file);
});

// Export
document.getElementById('btnExport').addEventListener('click', () => {
    const text = generateMapID(mapData);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MapID_Config_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// Save Firebase
document.getElementById('btnSave').addEventListener('click', async () => {
    const btn = document.getElementById('btnSave');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
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
        alert("Lỗi lưu: " + e.message);
    } finally {
        btn.innerHTML = oldText;
    }
});

// Init
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

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('translate-x-full');
    setTimeout(() => t.classList.add('translate-x-full'), 3000);
}
