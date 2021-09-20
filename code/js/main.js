// 场景参数
var camera, scene, renderer, orbit_ctrl, trfm_ctrl;

var user_options = document.getElementById('option');
var container = document.getElementById('container');
var show_eval_pts = document.getElementById('show_eval_pts');

// 分割面
var mesh;
var vert = [];
var model_index = 0;
var model_scale;

// FFD类
var ffd = new FFD();
var MIN_SPAN_COUNT = 1;
var MAX_SPAN_COUNT = 6;
var span_counts = [2, 2, 2];
var span_count_change = false;

// 控制点的几何形：球状，蓝色
var ctrl_pt_geom = new THREE.SphereGeometry(5);
var ctrl_pt_material = new THREE.MeshLambertMaterial({ color: 0x00ffff });
// 控制点结合的网格（用于渲染）
var ctrl_pt_meshes = [];
var ctrl_pt_mesh_selected = null;
// 网格几何形：线条，深蓝
var lattice_lines = [];
var lattice_line_material = new THREE.LineBasicMaterial({ color: 0x4d4dff });

// 估计点
var eval_pt_spans = new THREE.Vector3(16, 16, 16);
var eval_pt_counts = new THREE.Vector3(
                                eval_pt_spans.x + 1,
                                eval_pt_spans.y + 1,
                                eval_pt_spans.z + 1);
var eval_pts_geom = new THREE.Geometry();
var eval_pts_mesh;
// 是否显示估计点
var show_eval_pts_check = false;
// 鼠标射线
var raycaster = new THREE.Raycaster();
// 鼠标坐标
var mouse = new THREE.Vector2();

// 预置模型库
var models = [
    { type: 'BoxGeometry', args: [200, 200, 200, 2, 2, 2] },
    { type: 'TorusGeometry', args: [100, 60, 4, 8, Math.PI * 2] },
    { type: 'TorusKnotGeometry', args: [], scale: 0.25, meshScale: 3 },
    { type: 'SphereGeometry', args: [100, 9, 5], meshScale: 1.5 },
    { type: 'CylinderGeometry', args: [50, 50, 200, 8, 3], meshScale: 1.5 },
    { type: 'OctahedronGeometry', args: [200, 0] },
    {
    	type: 'LatheGeometry', args: [[
          new THREE.Vector2(0, 0),
          new THREE.Vector2(50, 50),
          new THREE.Vector2(10, 100),
          new THREE.Vector2(50, 150),
          new THREE.Vector2(0, 200)]], meshScale: 2
    },
];

// 根据参数创建新的模型
var createGeometry = function(modelType, args) {
	var F = function(modelType, args) {
		return modelType.apply(this, args);
	};
	F.prototype = modelType.prototype;
	return new F(modelType, args);
};

// 初始化
init();
animate();

function init() {
	// 视角
	camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1000);
	camera.position.z = 500;

	// 场景
	scene = new THREE.Scene();

	// 光照
	var ambient = new THREE.AmbientLight(0xf0f0f0, 0.75);
	scene.add(ambient); 
	var light = new THREE.SpotLight(0xffffff);
	light.position.set(-200, 200, 500);
	scene.add(light);

	// 辅助坐标轴
	// var axisHelper = new THREE.AxisHelper(250);
	// scene.add(axisHelper);
  
	// 渲染器
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setClearColor(0x000000);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	container.appendChild(renderer.domElement);
	renderer.domElement.addEventListener('mousemove', onDocumentMouseMove, false);
	renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false);
	renderer.shadowMap.enabled = true;

	// 相机轨道控制器
	orbit_ctrl = new THREE.OrbitControls(camera, renderer.domElement);
	orbit_ctrl.damping = 0.2;
	orbit_ctrl.addEventListener('change', render);

	// 交互变形控制器
	trfm_ctrl = new THREE.TransformControls(camera, renderer.domElement);
	trfm_ctrl.addEventListener('change', render);
	scene.add(trfm_ctrl);
	trfm_ctrl.addEventListener('objectChange', function(e) {
		updateLattice();
		deform();
	});

	// 窗口大小监控
	window.addEventListener('resize', onWindowResize, false);

	// 加入估计点的网格
	var total_eval_pts_count = eval_pt_counts.x * eval_pt_counts.y * eval_pt_counts.z;
	for (var i = 0; i < total_eval_pts_count; i++)
		eval_pts_geom.vertices.push(new THREE.Vector3());
	eval_pts_mesh = new THREE.Points(eval_pts_geom.clone(), new THREE.PointsMaterial({ color: 0xff0000, size: 2 }));
	scene.add(eval_pts_mesh);

	// 加入模型
	addModel();
}

// 事件：窗口大小重置
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
}

// 事件：鼠标移动
function onDocumentMouseMove(event) {
	event.preventDefault();
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	raycaster.setFromCamera(mouse, camera);
	var intersects = raycaster.intersectObjects(ctrl_pt_meshes);

	// 鼠标移动到控制点上方
	if (intersects.length > 0 && ctrl_pt_mesh_selected != intersects[0].object) {
		container.style.cursor = 'pointer';
	}
	else {
		container.style.cursor = 'auto';
	}
}

// 事件：鼠标点击
function onDocumentMouseDown(event) {
	event.preventDefault();
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	raycaster.setFromCamera(mouse, camera);
	var intersects = raycaster.intersectObjects(ctrl_pt_meshes);

	// 鼠标点击控制点
	if (intersects.length > 0 && ctrl_pt_mesh_selected != intersects[0].object) {
		// 不允许变换视角
		orbit_ctrl.enabled = false;
		// 交互变形
		if (ctrl_pt_mesh_selected)
			trfm_ctrl.detach(trfm_ctrl.object);
		// 避免重选择
		ctrl_pt_mesh_selected = intersects[0].object;
		trfm_ctrl.attach(ctrl_pt_mesh_selected);
	}
	else {
		orbit_ctrl.enabled = true;
	}
}

// 实时监测函数，控制器更新
function animate() {
	requestAnimationFrame(animate);
	orbit_ctrl.update();
	trfm_ctrl.update();
	render();
}

// 渲染
function render() {
	eval_pts_mesh.visible = show_eval_pts.checked;
	renderer.render(scene, camera);
}

// 更换模型
function switchModel(index) {
	model_index = index;
	addModel();
}

// 更新显示的控制点个数（分割）
function updateSpanCount() {
	var xcnt = document.getElementById('xcnt');
	xcnt.innerText = ' ' + span_counts[0];
	var ycnt = document.getElementById('ycnt');
	ycnt.innerText = ' ' + span_counts[1];
	var zcnt = document.getElementById('zcnt');
	zcnt.innerText = ' ' + span_counts[2];
}

// 加入模型
function addModel() {
	// 清空
	if (mesh) {
		// scene.remove(group);
		scene.remove(mesh);
	}

	// 生成新的几何体
	var subd_modifier = new THREE.SubdivisionModifier(2);
	var model = models[model_index];
	geom = createGeometry(THREE[model.type], model.args);

	// 缩放
	if (model.scale)
		geom.scale(model.scale, model.scale, model.scale);

	// 生成法向量、合并重复顶点、计算顶点向量
	geom.mergeVertices();
	geom.computeFaceNormals();
	geom.computeVertexNormals();

	// 细分层级
	subd_modifier.modify(geom);

	var faceABCD = "abcd";
	var color, f, p, n, vertexIndex;

	for (i = 0; i < geom.faces.length; i++) {
		f = geom.faces[i];
		n = (f instanceof THREE.Face3) ? 3 : 4;

		for (var j = 0; j < n; j++) {
			vertexIndex = f[faceABCD.charAt(j)];
			p = geom.vertices[vertexIndex];
			color = new THREE.Color(0xffffff);
			color.setHSL((p.x + p.y + p.z) / 200 + 0.5, 1.0, 0.5);
			f.vertexColors[j] = color;
		}
	}

	// 创建网格
	var material = [
        new THREE.MeshPhongMaterial({ color: 0xffffff, shading: THREE.FlatShading, vertexColors: THREE.VertexColors, shininess: 0.5 }),
        new THREE.MeshBasicMaterial({ color: 0x405040, wireframe: true, opacity: 0.8, transparent: true })
	];
	mesh = THREE.SceneUtils.createMultiMaterialObject(geom, material);

	model_scale = model.meshScale ? model.meshScale : 1;
	mesh.scale.x = model_scale;
	mesh.scale.y = model_scale;
	mesh.scale.z = model_scale;
	scene.add(mesh);

	// 几何体顶点
	vert.length = 0;
	for (i = 0; i < geom.vertices.length; i++) {
		var copy_pt = new THREE.Vector3();
		copy_pt.copy(geom.vertices[i]);
		vert.push(copy_pt);
	}

	// 初始化FFD相关
	span_count_change = false;
	initFFD();
}

// 控制点的变化
function changeSpanCount(direction, val) {
	// 确认范围
	span_counts[direction] = Math.max(MIN_SPAN_COUNT, Math.min(span_counts[direction] + val, MAX_SPAN_COUNT));
	span_count_change = true;
	initFFD();
	updateSpanCount();
}

// FFD初始化
function initFFD() {
	// 清除之前的控制点和线框
	for (var i = 0; i < ctrl_pt_meshes.length; i++)
		scene.remove(ctrl_pt_meshes[i]);
	ctrl_pt_meshes.length = 0;
	for (var i = 0; i < lattice_lines.length; i++)
		scene.remove(lattice_lines[i]);
	lattice_lines.length = 0;

	// 解绑移动控制器
	trfm_ctrl.detach();

	var bbox;
	// 得到嵌入空间盒
	if (span_count_change) {
		bbox = ffd.getBoundingBox();
	}
	else {
		bbox = new THREE.Box3();
		// 嵌入
		bbox.setFromPoints(geom.vertices);
		// 缩放                
		if (model_scale != 1)
			bbox.set(bbox.min.multiplyScalar(model_scale), bbox.max.multiplyScalar(model_scale))
	}

	// 控制点的数量（切割）
	var span_counts_copy = [span_counts[0], span_counts[1], span_counts[2]];

	// 重建线框
	ffd.drawLattice(bbox, span_counts_copy);

	// 绘制控制点网格、线框
	for (var i = 0; i < ffd.getTotalCtrlPtCount() ; i++) {
		var ctrl_pt_mesh = new THREE.Mesh(ctrl_pt_geom, ctrl_pt_material);
		ctrl_pt_mesh.position.copy(ffd.getPosition(i));
		ctrl_pt_mesh.material.ambient = ctrl_pt_mesh.material.color;

		ctrl_pt_meshes.push(ctrl_pt_mesh);
		scene.add(ctrl_pt_mesh);
	}
	// 绘制线框
	addLatticeLines();

	deform();
}

// 增加线框
function addLatticeLines() {
	for (var i = 0; i < ffd.getCtrlPtCount(0) - 1; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) ; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) ; k++) {
				var geometry = new THREE.Geometry();
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i, j, k)].position);
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i + 1, j, k)].position);
				var line = new THREE.Line(geometry, lattice_line_material);

				lattice_lines.push(line);
				scene.add(line);
			}
		}
	}
	for (var i = 0; i < ffd.getCtrlPtCount(0) ; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) - 1; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) ; k++) {
				var geometry = new THREE.Geometry();
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i, j, k)].position);
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i, j + 1, k)].position);
				var line = new THREE.Line(geometry, lattice_line_material);

				lattice_lines.push(line);
				scene.add(line);
			}
		}
	}
	for (var i = 0; i < ffd.getCtrlPtCount(0) ; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) ; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) - 1; k++) {
				var geometry = new THREE.Geometry();
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i, j, k)].position);
				geometry.vertices.push(ctrl_pt_meshes[ffd.getIndex(i, j, k + 1)].position);
				var line = new THREE.Line(geometry, lattice_line_material);

				lattice_lines.push(line);
				scene.add(line);
			}
		}
	}
}

// 更新线框
function updateLattice() {
	// 重置所有控制点
	for (var i = 0; i < ffd.getTotalCtrlPtCount() ; i++)
		ffd.setPosition(i, ctrl_pt_meshes[i].position);

	var line_index = 0;
	for (var i = 0; i < ffd.getCtrlPtCount(0) - 1; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) ; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) ; k++) {
				var line = lattice_lines[line_index++];
				line.geometry.vertices[0] = ctrl_pt_meshes[ffd.getIndex(i, j, k)].position;
				line.geometry.vertices[1] = ctrl_pt_meshes[ffd.getIndex(i + 1, j, k)].position;
				line.geometry.verticesNeedUpdate = true;
			}
		}
	}
	for (var i = 0; i < ffd.getCtrlPtCount(0) ; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) - 1; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) ; k++) {
				var line = lattice_lines[line_index++];
				line.geometry.vertices[0] = ctrl_pt_meshes[ffd.getIndex(i, j, k)].position;
				line.geometry.vertices[1] = ctrl_pt_meshes[ffd.getIndex(i, j + 1, k)].position;
				line.geometry.verticesNeedUpdate = true;
			}
		}
	}
	for (var i = 0; i < ffd.getCtrlPtCount(0) ; i++) {
		for (var j = 0; j < ffd.getCtrlPtCount(1) ; j++) {
			for (var k = 0; k < ffd.getCtrlPtCount(2) - 1; k++) {
				var line = lattice_lines[line_index++];
				line.geometry.vertices[0] = ctrl_pt_meshes[ffd.getIndex(i, j, k)].position;
				line.geometry.vertices[1] = ctrl_pt_meshes[ffd.getIndex(i, j, k + 1)].position;
				line.geometry.verticesNeedUpdate = true;
			}
		}
	}
}

// 变形
function deform() {
	// 更新几何体顶点
	for (i = 0; i < geom.vertices.length; i++) {
		// 计算变形后顶点
		var eval_pt = ffd.evalWorld(vert[i]);
		if (eval_pt.equals(geom.vertices[i]))
			continue;
		geom.vertices[i].copy(eval_pt);
	}
	geom.verticesNeedUpdate = true;

	// 绘制插值估计点
	if (show_eval_pts_check) {
		var multipliers = new THREE.Vector3(1 / eval_pt_spans.x, 1 / eval_pt_spans.y, 1 / eval_pt_spans.z);
		var mesh_vert;
		var mesh_vert_counter = 0;
		for (var i = 0; i < eval_pt_counts.x; i++) {
			var s = i * multipliers.x;
			for (var j = 0; j < eval_pt_counts.y; j++) {
				var t = j * multipliers.y;
				for (var k = 0; k < eval_pt_counts.z; k++) {
					var u = k * multipliers.z;
					// 进行计算，得到变化后的点
					var eval_pt = ffd.evalLocal(s, t, u);
					mesh_vert = eval_pts_mesh.geometry.vertices[mesh_vert_counter++];
					if (eval_pt.equals(mesh_vert))
						continue;
					mesh_vert.copy(eval_pt);
				}
			}
		}
		eval_pts_mesh.geometry.verticesNeedUpdate = true;
	}
}
