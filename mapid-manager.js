import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. CONFIG FIREBASE (Giữ nguyên cấu hình của bạn)
const firebaseConfig = { apiKey: "AIzaSyCqAX3x1MbJ3do7m3EaH9JA4kFuVhlAc78", authDomain: "lms-thitracnghiem.firebaseapp.com", projectId: "lms-thitracnghiem", storageBucket: "lms-thitracnghiem.firebasestorage.app", messagingSenderId: "760187217240", appId: "1:760187217240:web:d043cd5808c349f87a712d" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 2. STATE
let mapData = { metadata: [], tree: [] };
let selectedNode = null;
let expandedNodes = new Set(); // Lưu ID các node đang mở

// 3. CORE LOGIC: PARSER (Xử lý file text -> JSON)
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

// 4. CORE LOGIC: GENERATOR (JSON -> Text)
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

// Helper: Tìm đường dẫn từ gốc đến node
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

// Helper: Đếm số con cháu
function countTotalChildren(node) {
    let count = node.children ? node.children.length : 0;
    if (node.children) {
        node.children.forEach(child => count += countTotalChildren(child));
    }
    return count;
}

// 5. UI RENDERER (Vẽ cây)
function renderTree() {
    const container = document.getElementById('treeContainer');
    container.innerHTML = '';
    let totalNodes = 0;

    if (mapData.tree.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400">Trống</div>';
        return;
    }

    // Hàm đệ quy tạo HTML cho từng node
    function createNodeElement(node, parentPathId = "") {
        totalNodes++;
        const currentPathId = parentPathId ? `${parentPathId}_${node.id}` : node.id;
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(currentPathId);
        const isSelected = selectedNode === node;

        const wrapper = document.createElement('div');

        // Dòng hiển thị Node
        const row = document.createElement('div');
        row.className = `tree-node flex items-center gap-2 p-1.5 cursor-pointer rounded ${isSelected ? 'active' : ''}`;
        
        // Nút Toggle
        const toggleBtn = document.createElement('span');
        toggleBtn.className = `w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`;
        toggleBtn.innerHTML = hasChildren ? '<i class="fa-solid fa-caret-right"></i>' : '';
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (hasChildren) {
                if (isExpanded) expandedNodes.delete(currentPathId);
                else expandedNodes.add(currentPathId);
                renderTree();
            }
        };

        // Icon cấp độ
        let iconHtml = '<i class="fa-solid fa-circle text-[6px] text-gray-300"></i>';
        if (node.level === 0) iconHtml = '<i class="fa-solid fa-folder text-yellow-500"></i>';
        else if (node.level === 1) iconHtml = '<i class="fa-solid fa-book text-blue-500"></i>';
        else if (node.level === 2) iconHtml = '<i class="fa-solid fa-bookmark text-green-500"></i>';

        // Mã ID (Editable)
        const idBadge = document.createElement('span');
        idBadge.className = "font-mono text-xs font-bold text-gray-600 bg-gray-200 px-1.5 rounded min-w-[20px] text-center hover:bg-white hover:border hover:border-blue-300 outline-none focus:bg-white focus:border-blue-500";
        idBadge.contentEditable = true;
        idBadge.textContent = node.id;
        idBadge.onclick = (e) => e.stopPropagation(); // Chặn click lan ra dòng
        idBadge.onblur = () => { node.id = idBadge.textContent.trim(); updateRightPanel(); };
        idBadge.onkeydown = (e) => { if(e.key==='Enter'){ e.preventDefault(); idBadge.blur(); }};

        // Tên (Editable)
        const nameSpan = document.createElement('span');
        nameSpan.className = "node-name text-sm flex-1 truncate hover:border-b hover:border-dashed hover:border-gray-400 outline-none focus:border-b-2 focus:border-blue-500 focus:bg-white";
        nameSpan.contentEditable = true;
        nameSpan.textContent = node.name;
        nameSpan.onclick = (e) => e.stopPropagation();
        nameSpan.onblur = () => { node.name = nameSpan.textContent.trim(); updateRightPanel(); };
        nameSpan.onkeydown = (e) => { if(e.key==='Enter'){ e.preventDefault(); nameSpan.blur(); }};

        // Nút thêm con (+)
        const addBtn = document.createElement('button');
        addBtn.className = "opacity-0 group-hover:opacity-100 text-green-600 hover:bg-green-100 w-6 h-6 rounded flex items-center justify-center transition-opacity";
        addBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
        addBtn.title = "Thêm mục con";
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (!node.children) node.children = [];
            node.children.push({ id: "?", name: "Mục mới", level: node.level + 1, children: [] });
            expandedNodes.add(currentPathId);
            renderTree();
        };

        // Sự kiện chọn dòng
        row.onclick = () => {
            selectedNode = node;
            renderTree(); // Highlight dòng
            updateRightPanel();
        };

        row.classList.add('group'); // Cho hover effect
        row.appendChild(toggleBtn);
        row.innerHTML += `<div class="w-5 text-center">${iconHtml}</div>`;
        row.appendChild(idBadge);
        row.appendChild(nameSpan);
        row.appendChild(addBtn);

        wrapper.appendChild(row);

        // Render con
        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = "pl-6 border-l border-dashed border-gray-300 ml-2.5";
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

    const badge = document.getElementById('nodeCountBadge');
    if(badge) badge.textContent = `${totalNodes} mục`;
}

// 6. UI: RIGHT PANEL (Thông tin chi tiết)
function updateRightPanel() {
    const infoPanel = document.getElementById('infoPanel');
    const infoEmpty = document.getElementById('infoEmpty');
    const statPanel = document.getElementById('statPanel');

    if (!selectedNode) {
        if(infoPanel) infoPanel.classList.add('hidden');
        if(statPanel) statPanel.classList.add('hidden');
        if(infoEmpty) infoEmpty.classList.remove('hidden');
        return;
    }

    if(infoPanel) infoPanel.classList.remove('hidden');
    if(statPanel) statPanel.classList.remove('hidden');
    if(infoEmpty) infoEmpty.classList.add('hidden');

    // Breadcrumb & ID Preview
    const path = findPathToNode(mapData.tree, selectedNode);
    if (path) {
        const pathContainer = document.getElementById('pathContainer');
        if(pathContainer) {
            pathContainer.innerHTML = '';
            // Ghép ID (Có thể tùy chỉnh logic ghép chuỗi ở đây nếu cần dấu gạch ngang)
            let fullID = path.map(n => n.id).join(''); 
            
            // Xử lý ID lớp 9 hoặc THPT (thêm gạch ngang trước ý cuối cùng nếu cần)
            // Ví dụ: 1H2V3-4 (Nếu cấp cuối là dạng bài)
            
            document.getElementById('previewID').innerText = fullID;

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

    // Stats
    const elDirect = document.getElementById('statDirectChild');
    const elTotal = document.getElementById('statTotalChild');
    if(elDirect) elDirect.innerText = selectedNode.children ? selectedNode.children.length : 0;
    if(elTotal) elTotal.innerText = countTotalChildren(selectedNode);
}

// 7. EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    // Import
    const btnImport = document.getElementById('btnImport');
    if(btnImport) btnImport.addEventListener('click', () => document.getElementById('fileInput').click());
    
    document.getElementById('fileInput').addEventListener('change', (e) => {
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

    // Export
    const btnExport = document.getElementById('btnExport');
    if(btnExport) btnExport.addEventListener('click', () => {
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
    const btnSave = document.getElementById('btnSave');
    if(btnSave) btnSave.addEventListener('click', async () => {
        const oldText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
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
            btnSave.innerHTML = oldText;
        }
    });

    // Delete Node (Button trong panel bên phải)
    const btnDel = document.getElementById('btnDeleteNode');
    if(btnDel) btnDel.addEventListener('click', () => {
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
        showToast('Đã xóa mục!');
    });
});

// Load Init
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "configurations", "map_id_tree"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                mapData.tree = data.tree || [];
                mapData.metadata = data.metadata || [];
                renderTree();
                console.log("Đã tải cấu hình từ Server");
            }
        } catch(e) { console.log(e); }
    } else {
        window.location.href = 'index.html';
    }
});

function showToast(msg) {
    const t = document.getElementById('toast');
    if(t) {
        document.getElementById('toastMsg').innerText = msg;
        t.classList.remove('translate-x-full');
        setTimeout(() => t.classList.add('translate-x-full'), 3000);
    }
}
