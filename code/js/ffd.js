// FFD类
function FFD() {
	// 嵌入空间
	var mBBox = new THREE.Box3();

	// 每个方向的分割点个数（尺寸）
	var mSpanCounts = [0, 0, 0];

	// 每个方向控制点个数
	var mCtrlPtCounts = [0, 0, 0];

	// 控制点总个数
	var mTotalCtrlPtCount = 0;

	// 每条边上的矢量
	var mEdge = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];

	// 控制点的坐标
	var mCtrlPts = [];

	// 计算阶乘
	function fact(n) {
		var res = 1;
		for (var i = n; i > 0; i--)
			res *= i;
		return res;
	};

	// 生成Bernstein基函数Bi,n(u)
	function bernstein(n, i, u) {
		var coeff = fact(n) / (fact(i) * fact(n - i));
		return coeff * Math.pow(u, i) * Math.pow(1 - u, n - i);
	};

	// 得到原始的嵌入空间盒子
	this.getBoundingBox = function() { return mBBox; }

	// 得到某个坐标上的控制点个数
	this.getCtrlPtCount = function(i) { return mCtrlPtCounts[i]; }

	// 得到总控制点个数 
	this.getTotalCtrlPtCount = function() { return mTotalCtrlPtCount; }

	// 将给定的三元坐标转化为一元
	this.getIndex = function(i, j, k) {
		return i * mCtrlPtCounts[1] * mCtrlPtCounts[2] + j * mCtrlPtCounts[2] + k;
	};

	// 由一元下标返回控制点位置
	this.getPosition = function(index) {
		return mCtrlPts[index];
	};

	// 由一元下标设置控制点位置
	this.setPosition = function(index, position) {
		mCtrlPts[index] = position;
	};

	// 由三元坐标返回控制点位置
	this.getPositionTernary = function(i, j, k) {
		return mCtrlPts[this.getIndex(i, j, k)];
	};

	// 由三元坐标设置控制点位置
	this.setPositionTernary = function(i, j, k, position) {
		mCtrlPts[this.getIndex(i, j, k)] = position;
	};

	// 重建线框
	this.drawLattice = function(bbox, span_counts) {
		// 0 1 2 分别是stu坐标
		if (mBBox.equals(bbox) &&
            mSpanCounts[0] == span_counts[0] &&
            mSpanCounts[1] == span_counts[1] &&
            mSpanCounts[2] == span_counts[2])
			return;
		// 没有变化，不重建

		// 重建
		mBBox = bbox;
		mSpanCounts = span_counts;
		mCtrlPtCounts = [mSpanCounts[0] + 1, mSpanCounts[1] + 1, mSpanCounts[2] + 1];
		mTotalCtrlPtCount = mCtrlPtCounts[0] * mCtrlPtCounts[1] * mCtrlPtCounts[2];

		// 设定s,t,u坐标空间
		mEdge[0].x = mBBox.max.x - mBBox.min.x;
		mEdge[1].y = mBBox.max.y - mBBox.min.y;
		mEdge[2].z = mBBox.max.z - mBBox.min.z;

		// 重设控制点
		mCtrlPts = new Array(mTotalCtrlPtCount);

		// 设置每个控制点的位置
		for (var i = 0; i < mCtrlPtCounts[0]; i++) {
			for (var j = 0; j < mCtrlPtCounts[1]; j++) {
				for (var k = 0; k < mCtrlPtCounts[2]; k++) {
					var position = new THREE.Vector3(
                        mBBox.min.x + (i / mSpanCounts[0]) * mEdge[0].x,
                        mBBox.min.y + (j / mSpanCounts[1]) * mEdge[1].y,
                        mBBox.min.z + (k / mSpanCounts[2]) * mEdge[2].z
                    );
					this.setPositionTernary(i, j, k, position);
				}
			}
		}
	};

	// 获取(s,t,u)空间的估计点——变化后坐标
	this.evalLocal = function(s, t, u) {
		var eval_pt = new THREE.Vector3(0, 0, 0);
		for (var i = 0; i < mCtrlPtCounts[0]; i++) {
			var point1 = new THREE.Vector3(0, 0, 0);
			for (var j = 0; j < mCtrlPtCounts[1]; j++) {
				var point2 = new THREE.Vector3(0, 0, 0);
				for (var k = 0; k < mCtrlPtCounts[2]; k++) {
					// 计算矢量和berstein基函数
					var position = this.getPositionTernary(i, j, k);
					var poly_u = bernstein(mSpanCounts[2], k, u);
					// 将所传入的矢量与标量相乘所得的乘积和这个向量相加
					point2.addScaledVector(position, poly_u);
				}
				var poly_t = bernstein(mSpanCounts[1], j, t);
				point1.addScaledVector(point2, poly_t);
			}
			var poly_s = bernstein(mSpanCounts[0], i, s);
			eval_pt.addScaledVector(point1, poly_s);
		}
		return eval_pt;
	};

	// 计算相对坐标（局部坐标）
	this.world2local = function(world_pt) {
		// 构建向量：从框定空间的最小点指向目标世界坐标
		var vec = new THREE.Vector3(world_pt.x, world_pt.y, world_pt.z);
		vec.sub(mBBox.min);
		// 叉积
		var cross = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
		cross[0].crossVectors(mEdge[1], mEdge[2]);
		cross[1].crossVectors(mEdge[0], mEdge[2]);
		cross[2].crossVectors(mEdge[0], mEdge[1]);
		// 局部坐标
		var local_pt = new THREE.Vector3();
		for (var i = 0; i < 3; i++) {
			local_pt.setComponent(i, cross[i].dot(vec) / cross[i].dot(mEdge[i]));
		}
		return local_pt;
	};

}

// FFD得到变形后的世界坐标（绝对坐标）
FFD.prototype.evalWorld = function(world_pt) {
	var local = this.world2local(world_pt);
	return this.evalLocal(local.x, local.y, local.z);
}
