"use strict";

const DOM = {
    editScene: document.querySelector('#editScene'),
    runScene: document.querySelector('#runScene'),
    editor: document.querySelector('#editor'),
    run: document.querySelector('#run'),
    saveload: document.querySelector('#saveload'),

    ctx: {
        editCtx: document.querySelector('#editScene').getContext('2d'),
        runCtx: document.querySelector('#runScene').getContext('2d')
    },

    buttons: {
        create: document.querySelector('#cre'),
        fix: document.querySelector('#fix'),
        hinge: document.querySelector('#hinge'),
        motor: document.querySelector('#motor'),
        select: document.querySelector('#sel'),
        alldelete: document.querySelector('#alldel'),

        run: document.querySelector('#runBtn'),
        edit: document.querySelector('#editBtn'),
        load: document.querySelector('#loadBtn'),

        start: document.querySelector('#startBtn'),
        stop: document.querySelector('#stopBtn'),
        reset: document.querySelector('#resetBtn'),

        delete: document.querySelector('#del'),

        jointDelete: document.querySelector('#jointDel'),

        loader: document.querySelector('#loaderBtn')
    },

    menus: {
        name: document.querySelector('.name'),
        rectSelectMenu: document.querySelector('#rectSelectMenu'),
        groupBtns: document.querySelectorAll('.groupBtn')
    },

    jointMenus: {
        jointName: document.querySelector('.jointName'),
        jointSelectMenu: document.querySelector('#jointSelectMenu'),
        jointTypeChangers: document.querySelectorAll('.jointTypeChanger'),
        sliders: {
            speedSlider: document.querySelector('#speedSlider'),
            torqueSlider: document.querySelector('#torqueSlider'),
            values: {
                speedValue: document.querySelector('#speedValue'),
                torqueValue: document.querySelector('#torqueValue')
            }
        }
    },

    load: {
        textbox: document.querySelector('#saveData')
    }
}

const CONFIG = {
    cell: 20,
    repaircell: 6,
    SCALE: 50,
    xoffset: 150,
    yoffset: 320,

    editorSize: {
        width: 800,
        height: 600
    },

    runnerSize: {
        width: 800,
        height: 600
    },
    
    motor: {
        speed: {
            min: -10,
            max: 10,
            default: -3
        },

        torque: {
            min: 0,
            max: 500,
            default: 100
        }
    }
};

DOM.editScene.width = CONFIG.editorSize.width;
DOM.editScene.height = CONFIG.editorSize.height;

DOM.runScene.width = CONFIG.runnerSize.width;
DOM.runScene.height = CONFIG.runnerSize.height;

CONFIG.cols = Math.floor(DOM.editScene.width / CONFIG.cell);
CONFIG.rows = Math.floor(DOM.editScene.height / CONFIG.cell);

DOM.jointMenus.sliders.speedSlider.min = CONFIG.motor.speed.min;
DOM.jointMenus.sliders.speedSlider.max = CONFIG.motor.speed.max;
DOM.jointMenus.sliders.speedSlider.value = CONFIG.motor.speed.default;

DOM.jointMenus.sliders.torqueSlider.min = CONFIG.motor.torque.min;
DOM.jointMenus.sliders.torqueSlider.max = CONFIG.motor.torque.max;
DOM.jointMenus.sliders.torqueSlider.value = CONFIG.motor.torque.default;

DOM.jointMenus.sliders.values.speedValue.textContent =DOM.jointMenus.sliders.speedSlider.value;
DOM.jointMenus.sliders.values.torqueValue.textContent =DOM.jointMenus.sliders.torqueSlider.value;

const STATE = {
    mode: "edit",
    tool: "create",
    rawtype: null,
    modeInRun: "pause",

    selectedRect: null,
    selectedJoint: null,
    selectedRectOfJoint: [],

    mouse: {
        isDown: false,
        cellX: null,
        cellY: null,
        startX: null,
        startY: null,
        endX: null,
        endY: null,
        grabBody: null,
        mouseJoint: null,
    },
};

const groupColors = {
    [-1]: "rgba(0,120,255,0.4)",
    [-2]: "rgba(255,80,80,0.4)",
    [-3]: "rgba(0,200,0,0.4)",
    [-4]: "rgba(255,220,0,0.4)",
    [-5]: "rgba(180,0,255,0.4)",
    [-6]: "rgba(255,140,0,0.4)",
    [-7]: "rgba(0,255,255,0.4)"
};

const groupFilter = {
    [-1]: 0x0001,
    [-2]: 0x0002,
    [-3]: 0x0004,
    [-4]: 0x0008,
    [-5]: 0x0010,
    [-6]: 0x0020,
    [-7]: 0x0040
};

const WORLD = {
    objects: [],
    runObjects: [],
    joints: [],
    runJoints: [],
    bodyMap: {},
    mouseBody: null
}

class Rect {
    static count = 0;
    constructor(left, top, width, height, data = null) {
        this.id = crypto.randomUUID();
        this.name = `object${++Rect.count}`;
        this.left = left;
        this.top = top;
        this.width = width;
        this.centerX = this.left + this.width / 2;
        this.height = height;
        this.centerY = this.top + this.height / 2;
        this.angle = 0;
        this.z = Date.now();
        this.group = -1;
        this.physicsGroup = 1;
        if (data) {
            Object.assign(this, data);
        }
        this.centerX = this.left + this.width / 2;
        this.centerY = this.top + this.height / 2;
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            left: this.left,
            top: this.top,
            width: this.width,
            height: this.height,
            angle: this.angle,
            z: this.z,
            group: this.group,
            physicsGroup: this.physicsGroup
        }
    }
}

class RunObject {
    constructor(rect) {
        this.rectId = rect.id;
        this.name = rect.name;
        this.group = rect.group;

        this.width = rect.width * CONFIG.repaircell;
        this.height = rect.height * CONFIG.repaircell;

        const point = editToWorld(rect.centerX, rect.centerY);

        this.body = physics.world.createBody({
            type: "dynamic",
            position: planck.Vec2(point.x / CONFIG.SCALE, point.y / CONFIG.SCALE)
        });

        const filter = groupFilter[rect.group];

        this.body.createFixture(
            planck.Box(
                this.width / 2 / CONFIG.SCALE,
                this.height / 2 / CONFIG.SCALE
            ),
            {
                friction: 1,
                density: 5,

                filterCategoryBits: filter,
                filterMaskBits: 0xffff ^ filter
            }
        );

        WORLD.bodyMap[rect.id] = this.body;
    }
}

class Joint {
    static count = 0;
    constructor(type, aId, bId, x, y, options = {}, data = null) {
        this.id = crypto.randomUUID();
        this.name = `joint${++Joint.count}`;
        this.type = type;
        this.aId = aId;
        this.bId = bId;
        this.x = x;
        this.y = y;
        this.options = options;
        if (data) {
            Object.assign(this, data);
        }
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            aId: this.aId,
            bId: this.bId,
            x: this.x,
            y: this.y,
            options: this.options
        };
    }
}

class RunJoint {
    constructor(joint) {
        this.jointId = joint.id;
        this.name = joint.name;
        this.type = joint.type;
        this.bodyA = WORLD.bodyMap[joint.aId];
        this.bodyB = WORLD.bodyMap[joint.bId];
        this.options = joint.options;

        const point = editToWorld(joint.x, joint.y);
        const anchor = planck.Vec2(point.x / CONFIG.SCALE, point.y / CONFIG.SCALE);

        if (this.type === "hinge") {
            const revolute = planck.RevoluteJoint(
                {
                    enableLimit: false,
                    enableMotor: false,
                    referenceAngle: this.options.relativeAngle,
                    motorSpeed: this.options.speed,
                    maxMotorTorque: this.options.maxTorque
                },
                this.bodyA,
                this.bodyB,
                anchor
            );
            this.joint = physics.world.createJoint(revolute);
        } else if (this.type === "fix") {
            const weld = planck.WeldJoint(
                {
                    enableLimit: false,
                    enableMotor: false,
                    referenceAngle: this.options.relativeAngle,
                    motorSpeed: this.options.speed,
                    maxMotorTorque: this.options.maxTorque
                },
                this.bodyA,
                this.bodyB,
                anchor
            );
            this.joint = physics.world.createJoint(weld);
        } else if (this.type === "motor") {
            const revolute = planck.RevoluteJoint(
                {
                    enableLimit: false,
                    enableMotor: true,
                    referenceAngle: this.options.relativeAngle,
                    motorSpeed: this.options.speed,
                    maxMotorTorque: this.options.maxTorque
                },
                this.bodyA,
                this.bodyB,
                anchor
            );
            this.joint = physics.world.createJoint(revolute);
        }
    }
}

class PhysicsWorld {
    constructor() {
        this.world = planck.World({
            gravity: planck.Vec2(0, 10)
        });
    }
}

const physics = new PhysicsWorld();

function getPointerPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function editToWorld(x, y) {
    return {
        x: x * CONFIG.repaircell + CONFIG.xoffset,
        y: y * CONFIG.repaircell + CONFIG.yoffset,
    };
}

function makeBlock() {
    let left = Math.min(STATE.mouse.startX, STATE.mouse.endX);
    let right = Math.max(STATE.mouse.startX, STATE.mouse.endX);

    let top = Math.min(STATE.mouse.startY, STATE.mouse.endY);
    let bottom = Math.max(STATE.mouse.startY, STATE.mouse.endY);

    let width = right - left + 1;
    let height = bottom - top + 1;
    return { left, top, width, height };
}

function createFloor() {
    const floor1 = physics.world.createBody({
        type: "static",
        position: planck.Vec2(400 / CONFIG.SCALE, 620 / CONFIG.SCALE)
    });

    floor1.createFixture(
        planck.Box(400 / CONFIG.SCALE, 20 / CONFIG.SCALE),
        {
            friction: 1.5,
            restitution: 0.01,

            filterCategoryBits: 0x0080,
            filterMaskBits: 0xffff
        }
    );

    const floor2 = physics.world.createBody({
        type: "static",
        position: planck.Vec2(400 / CONFIG.SCALE, 560 / CONFIG.SCALE)
    });

    floor2.createFixture(
        planck.Box(250 / CONFIG.SCALE, 60 / CONFIG.SCALE),
        {
            friction: 1.5,
            restitution: 0.01,

            filterCategoryBits: 0x0080,
            filterMaskBits: 0xffff
        }
    );

    const leftWall = physics.world.createBody({
        type: "static",
        position: planck.Vec2(-20 / CONFIG.SCALE, 300 / CONFIG.SCALE)
    });

    leftWall.createFixture(
        planck.Box(20 / CONFIG.SCALE, 300 / CONFIG.SCALE),
        {
            friction: 1.5,
            restitution: 0.01,

            filterCategoryBits: 0x0080,
            filterMaskBits: 0xffff
        }
    );

    const rightWall = physics.world.createBody({
        type: "static",
        position: planck.Vec2(820 / CONFIG.SCALE, 300 / CONFIG.SCALE)
    });

    rightWall.createFixture(
        planck.Box(20 / CONFIG.SCALE, 300 / CONFIG.SCALE),
        {
            friction: 1.5,
            restitution: 0.01,

            filterCategoryBits: 0x0080,
            filterMaskBits: 0xffff
        }
    );

    const ceiling = physics.world.createBody({
        type: "static",
        position: planck.Vec2(400 / CONFIG.SCALE, -20 / CONFIG.SCALE)
    });

    ceiling.createFixture(
        planck.Box(400 / CONFIG.SCALE, 20 / CONFIG.SCALE),
        {
            friction: 1.5,
            restitution: 0.01,
            filterCategoryBits: 0x0080,
            filterMaskBits: 0xffff
        }
    );
}

function resetWorld() {
    physics.world = planck.World({
        gravity: planck.Vec2(0, 10)
    });

    WORLD.mouseBody = physics.world.createBody();
    WORLD.bodyMap = {};
    WORLD.runObjects.length = 0;
    WORLD.runJoints.length = 0;
    createFloor();
}

function resetRunObjects() {
    resetWorld();

    if (STATE.mode === "run") {
        WORLD.runObjects.push(...WORLD.objects.map(r => new RunObject(r)));
        WORLD.runJoints.push(...WORLD.joints.map(j => new RunJoint(j)));
    }
}

function drawGrid() {
    DOM.ctx.editCtx.beginPath();
    DOM.ctx.editCtx.lineWidth = 1;
    DOM.ctx.editCtx.strokeStyle = '#ccc';
    for (let y = 0; y <= CONFIG.rows; y++) {
        DOM.ctx.editCtx.moveTo(0, y * CONFIG.cell);
        DOM.ctx.editCtx.lineTo(DOM.editScene.width, y * CONFIG.cell);
    }
    for (let x = 0; x <= CONFIG.cols; x++) {
        DOM.ctx.editCtx.moveTo(x * CONFIG.cell, 0);
        DOM.ctx.editCtx.lineTo(x * CONFIG.cell, DOM.editScene.height);
    }
    DOM.ctx.editCtx.stroke();
}

function drawRects() {
    const sorted = [...WORLD.objects].sort((a, b) => a.z - b.z);
    for (let i = 0; i < sorted.length; i++) {
        const rect = sorted[i];
        const base = groupColors[rect.group];
        DOM.ctx.editCtx.fillStyle = base;
        DOM.ctx.editCtx.lineWidth = 1;
        DOM.ctx.editCtx.fillRect(rect.left * CONFIG.cell, rect.top * CONFIG.cell, rect.width * CONFIG.cell, rect.height * CONFIG.cell);
        DOM.ctx.editCtx.strokeStyle = base.replace("0.4", "0.8");
        DOM.ctx.editCtx.fillStyle = base;
        DOM.ctx.editCtx.lineWidth = 4;
        DOM.ctx.editCtx.strokeRect(rect.left * CONFIG.cell, rect.top * CONFIG.cell, rect.width * CONFIG.cell, rect.height * CONFIG.cell);
    }
}

function drawJoints() {
    DOM.ctx.editCtx.lineWidth = 2;
    for (let i = 0; i < WORLD.joints.length; i++) {
        if (WORLD.joints[i].type === "fix") {
            DOM.ctx.editCtx.strokeStyle = 'red';
        } else if (WORLD.joints[i].type === "hinge") {
            DOM.ctx.editCtx.strokeStyle = 'blue';
        } else if (WORLD.joints[i].type === "motor") {
            DOM.ctx.editCtx.strokeStyle = 'green';
        }
        DOM.ctx.editCtx.beginPath();
        DOM.ctx.editCtx.arc(
            WORLD.joints[i].x * CONFIG.cell,
            WORLD.joints[i].y * CONFIG.cell,
            5,
            0,
            Math.PI * 2
        );
        DOM.ctx.editCtx.stroke();
    }
}

function drawRunObjects() {
    for (let i = 0; i < WORLD.runObjects.length; i++) {
        const body = WORLD.runObjects[i].body;
        const base = groupColors[WORLD.runObjects[i].group];

        const fixture = body.getFixtureList();
        const shape = fixture.getShape();
        const vertices = shape.m_vertices;

        DOM.ctx.runCtx.fillStyle = base;
        DOM.ctx.runCtx.strokeStyle = base.replace("0.4", "0.8");
        DOM.ctx.runCtx.lineWidth = 4;
        DOM.ctx.runCtx.beginPath();

        const first = body.getWorldPoint(vertices[0]);
        DOM.ctx.runCtx.moveTo(first.x * CONFIG.SCALE, first.y * CONFIG.SCALE);

        for (let j = 1; j < vertices.length; j++) {
            const p = body.getWorldPoint(vertices[j]);
            DOM.ctx.runCtx.lineTo(p.x * CONFIG.SCALE, p.y * CONFIG.SCALE);
        }

        DOM.ctx.runCtx.closePath();
        DOM.ctx.runCtx.fill();
        DOM.ctx.runCtx.stroke();
    }
}

function makeJoint() {
    STATE.selectedRectOfJoint = [];

    for (let i = WORLD.objects.length - 1; i >= 0; i--) {
        const rect = WORLD.objects[i];

        if (
            STATE.mouse.cellX >= rect.left &&
            STATE.mouse.cellX < rect.left + rect.width &&
            STATE.mouse.cellY >= rect.top &&
            STATE.mouse.cellY < rect.top + rect.height
        ) {
            STATE.selectedRectOfJoint.push(rect);
        }
    }

    STATE.selectedRectOfJoint.sort((a, b) => a.z - b.z);

    let rectA = null;
    let rectB = null;
    let type = null;
    let options = {};

    if (STATE.selectedRectOfJoint.length >= 2) {
        rectA = STATE.selectedRectOfJoint[0];
        rectB = STATE.selectedRectOfJoint[1];
        if (STATE.rawtype === "fix") {
            type = "fix";
            options = {
                relativeAngle: rectB.angle - rectA.angle,
                speed: -3,
                maxTorque: 100
            };
        } else if (STATE.rawtype === "hinge") {
            type = "hinge";
            options = {
                relativeAngle: rectB.angle - rectA.angle,
                speed: -3,
                maxTorque: 100
            };
        } else if (STATE.rawtype === "motor") {
            type = "motor";
            options = {
                relativeAngle: rectB.angle - rectA.angle,
                speed: -3,
                maxTorque: 100
            };
        }
        WORLD.joints.push(
            new Joint(
                type,
                rectA.id,
                rectB.id,
                STATE.mouse.cellX + 0.5,
                STATE.mouse.cellY + 0.5,
                options,
            )
        );
    } else {
        return;
    }
}

function changeJointType(joint, newType, oldOptions) {
    joint.type = newType;
    joint.options = oldOptions;
}

function changeJointSpeed(joint, speed) {
    joint.options.speed = speed;
}

function changeJointTorque(joint, torque) {
    joint.options.maxTorque = torque;
}

function editMode(e) {
    if (STATE.tool === "select") {
        for (let i = 0; i < WORLD.joints.length; i++) {
            WORLD.joints[i].selected = false;
        }

        STATE.selectedJoint = null;

        for (let i = WORLD.joints.length - 1; i >= 0; i--) {
            const joint = WORLD.joints[i];

            if (
                Math.floor(joint.x) === STATE.mouse.cellX &&
                Math.floor(joint.y) === STATE.mouse.cellY
            ) {
                STATE.selectedJoint = joint;
                break;
            } else {
                DOM.jointMenus.jointSelectMenu.style.display = "none";
            }
        }

        if (STATE.selectedJoint) {
            DOM.menus.rectSelectMenu.style.display = "none";
            DOM.jointMenus.jointSelectMenu.style.display = "flex";
            DOM.jointMenus.jointSelectMenu.style.left = e.pageX + "px";
            DOM.jointMenus.jointSelectMenu.style.top = e.pageY + "px";
            DOM.jointMenus.jointName.value = STATE.selectedJoint.name;
            return;
        }

        for (let i = WORLD.objects.length - 1; i >= 0; i--) {
            const rect = WORLD.objects[i];
            if (
                STATE.mouse.cellX >= rect.left &&
                STATE.mouse.cellX < rect.left + rect.width &&
                STATE.mouse.cellY >= rect.top &&
                STATE.mouse.cellY < rect.top + rect.height
            ) {
                STATE.selectedRect = rect;

                DOM.menus.rectSelectMenu.style.display = "flex";
                DOM.menus.rectSelectMenu.style.left = e.pageX + "px";
                DOM.menus.rectSelectMenu.style.top = e.pageY + "px";
                DOM.menus.name.value = rect.name;
                break;
            } else {
                DOM.menus.rectSelectMenu.style.display = "none";
            }
        }
    } else if (STATE.tool === "joint") {
        makeJoint();
        DOM.menus.rectSelectMenu.style.display = "none";
    }
}

function getBodyAtMouse(mouseX, mouseY) {
    const mouse = planck.Vec2(
        mouseX / CONFIG.SCALE,
        mouseY / CONFIG.SCALE
    );

    let result = null;
    const aabb = planck.AABB(mouse, mouse);

    physics.world.queryAABB(aabb, fixture => {
        if (fixture.testPoint(mouse)) {
            result = fixture.getBody();
            return false;
        }
        return true;
    });

    return result;
}

function runMode(e) {
    const pos = getPointerPos(e, DOM.runScene);

    if (e.type === "pointerdown") {
        DOM.runScene.setPointerCapture(e.pointerId);
        const body = getBodyAtMouse(pos.x, pos.y);
        if (body) {
            STATE.mouse.grabBody = body;

            const mouse = planck.Vec2(
                pos.x / CONFIG.SCALE,
                pos.y / CONFIG.SCALE
            );

            const jointDef = planck.MouseJoint(
                {
                    maxForce: 1000 * body.getMass(),
                    stiffness: 1000,
                    damping: 0.1
                },
                WORLD.mouseBody,
                body,
                mouse
            );
            const mouseJoint = physics.world.createJoint(jointDef);
            STATE.mouse.mouseJoint = mouseJoint;
        }
    } else if (e.type === "pointermove") {
        if (STATE.mouse.mouseJoint) {
            STATE.mouse.mouseJoint.setTarget(
                planck.Vec2(
                    pos.x / CONFIG.SCALE,
                    pos.y / CONFIG.SCALE
                )
            );
        }
    } else if (e.type === "pointerup") {
        DOM.runScene.releasePointerCapture(e.pointerId);
        if (STATE.mouse.mouseJoint) {
            physics.world.destroyJoint(STATE.mouse.mouseJoint);
        }
        STATE.mouse.mouseJoint = null;
        STATE.mouse.grabBody = null;
    }
}

function mouseMove(e) {
    if (STATE.mode === "edit") {
        const pos = getPointerPos(e, DOM.editScene);
        STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
        STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
        STATE.mouse.endX = STATE.mouse.cellX;
        STATE.mouse.endY = STATE.mouse.cellY;
    } else if (STATE.mode === "run") {
        const pos = getPointerPos(e, DOM.runScene);
        STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
        STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
        runMode(e);
    }
}

function mouseDown(e) {
    STATE.mouse.isDown = true;
    if (STATE.mode === "edit") {
        const pos = getPointerPos(e, DOM.editScene);
        STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
        STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
        editMode(e);
        if (STATE.tool === "create") {
            STATE.mouse.startX = Math.floor(pos.x / CONFIG.cell);
            STATE.mouse.startY = Math.floor(pos.y / CONFIG.cell);
        }
    } else if (STATE.mode === "run") {
        const pos = getPointerPos(e, DOM.runScene);
        STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
        STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
        runMode(e);
    }
}

function mouseUp(e) {
    if (!STATE.mouse.isDown) return;
    STATE.mouse.isDown = false;

    if (STATE.mode === "edit") {
        if (STATE.tool === "create") {
            const pos = getPointerPos(e, DOM.editScene);
            STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
            STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
            STATE.mouse.endX = Math.floor(pos.x / CONFIG.cell);
            STATE.mouse.endY = Math.floor(pos.y / CONFIG.cell);

            const rect = makeBlock();
            WORLD.objects.push(new Rect(rect.left, rect.top, rect.width, rect.height));

            STATE.mouse.startX = null;
            STATE.mouse.startY = null;
            STATE.mouse.endX = null;
            STATE.mouse.endY = null;
        }
    } else if (STATE.mode === "run") {
        const pos = getPointerPos(e, DOM.runScene);
        STATE.mouse.cellX = Math.floor(pos.x / CONFIG.cell);
        STATE.mouse.cellY = Math.floor(pos.y / CONFIG.cell);
        runMode(e);
    }
}

function handleCreateClick() {
    if (STATE.mode === "edit") {
        STATE.tool = "create";
    }
}

function handleSelectClick() {
    if (STATE.mode === "edit") {
        DOM.menus.rectSelectMenu.style.display = "none";
        STATE.tool = "select";
    }
}

function handleFixClick() {
    if (STATE.mode === "edit") {
        DOM.menus.rectSelectMenu.style.display = "none";
        STATE.tool = "joint";
        STATE.rawtype = "fix";
    }
}

function handleHingeClick() {
    if (STATE.mode === "edit") {
        DOM.menus.rectSelectMenu.style.display = "none";
        STATE.tool = "joint";
        STATE.rawtype = "hinge";
    }
}

function handleMotorClick() {
    if (STATE.mode === "edit") {
        DOM.menus.rectSelectMenu.style.display = "none";
        STATE.tool = "joint";
        STATE.rawtype = "motor";
    }
}

function handleDeleteOfAllClick() {
    if (STATE.mode === "edit") {
        WORLD.objects.length = 0;
        WORLD.joints.length = 0;
        STATE.selectedRect = null;
        STATE.selectedRectOfJoint = null;
    }
}

function handleDeleteClick() {
    if (STATE.mode === "edit") {
        DOM.menus.rectSelectMenu.style.display = "none";
        for (let i = WORLD.joints.length - 1; i >= 0; i--) {
            const joint = WORLD.joints[i];
            if (joint.aId === STATE.selectedRect.id || joint.bId === STATE.selectedRect.id) {
                WORLD.joints.splice(i, 1);
            }
        }

        const index = WORLD.objects.indexOf(STATE.selectedRect);
        if (index !== -1) {
            WORLD.objects.splice(index, 1);
        }
    }

    STATE.selectedRect = null;
}

function handleJointDeleteClick() {
    if (STATE.mode === "edit") {
        DOM.jointMenus.jointSelectMenu.style.display = "none";

        const index = WORLD.joints.indexOf(STATE.selectedJoint);
        if (index !== -1) {
            WORLD.joints.splice(index, 1);
        }
    }

    STATE.selectedRect = null;
}

function handleStartClick() {
    if (STATE.mode === "run") {
        STATE.modeInRun = "start";
    }
}

function handleStopClick() {
    if (STATE.mode === "run") {
        STATE.modeInRun = "pause";
    }
}

function handleResetClick() {
    if (STATE.mode === "run") {
        STATE.modeInRun = "pause";
        resetWorld();
        resetRunObjects();
        STATE.modeInRun = "run";
    }
}

function updateUI() {
    if (STATE.mode === "edit") {
        DOM.editor.style.display = "flex";
        DOM.run.style.display = "none";
        DOM.saveload.style.display = "none";
    } else if (STATE.mode === "run") {
        DOM.menus.rectSelectMenu.style.display = "none";
        DOM.jointMenus.jointSelectMenu.style.display = "none";
        DOM.editor.style.display = "none";
        DOM.run.style.display = "flex";
        DOM.saveload.style.display = "none";
    } else if (STATE.mode === "load") {
        DOM.menus.rectSelectMenu.style.display = "none";
        DOM.jointMenus.jointSelectMenu.style.display = "none";
        DOM.editor.style.display = "none";
        DOM.run.style.display = "none";
        DOM.saveload.style.display = "flex";
    }
}

function setMode(m) {
    STATE.mode = m;
    updateUI();
    resetRunObjects();
}

function handleLoadClick() {
    saveData();
}

function handleLoaderClick(e) {
    try {
        const data = JSON.parse(DOM.load.textbox.value);

        WORLD.objects.length = 0;
        WORLD.joints.length = 0;

        for (let i = 0; i < data.objects.length; i++) {
            const obj = data.objects[i];
            if (typeof obj.group !== "number" || obj.group > -1 || obj.group < -7) {
                alert("error: groupを-1に書き換えました")
                obj.group = -1;
            }
            const rect = new Rect(
                obj.left,
                obj.top,
                obj.width,
                obj.height,
                obj
            );

            WORLD.objects.push(rect);

        }

        for (let j = 0; j < data.joints.length; j++) {
            const joi = data.joints[j];
            const joint = new Joint(
                joi.type,
                joi.aId,
                joi.bId,
                joi.x,
                joi.y,
                joi.options,
                joi
            );

            WORLD.joints.push(joint);
        }
    } catch (e) {
        alert("入力ミスがあります");
    }
}

function saveData() {
    const data = {
        objects: WORLD.objects,
        joints: WORLD.joints
    };
    DOM.load.textbox.value =
        JSON.stringify(data, null, 2);
}

DOM.editScene.addEventListener("pointermove", mouseMove);
DOM.editScene.addEventListener("pointerdown", mouseDown);
DOM.editScene.addEventListener("pointerup", mouseUp);

DOM.runScene.addEventListener("pointerdown", mouseDown);
DOM.runScene.addEventListener("pointermove", mouseMove);
DOM.runScene.addEventListener("pointerup", mouseUp);

DOM.editScene.addEventListener("pointercancel", mouseUp);
DOM.runScene.addEventListener("pointercancel", mouseUp);

DOM.buttons.create.addEventListener("click", handleCreateClick);
DOM.buttons.fix.addEventListener("click", handleFixClick);
DOM.buttons.hinge.addEventListener("click", handleHingeClick);
DOM.buttons.motor.addEventListener("click", handleMotorClick);
DOM.buttons.select.addEventListener("click", handleSelectClick);
DOM.buttons.alldelete.addEventListener("click", handleDeleteOfAllClick);

DOM.buttons.run.addEventListener("click", () => setMode("run"));
DOM.buttons.edit.addEventListener("click", () => setMode("edit"));
DOM.buttons.load.addEventListener("click", () => setMode("load"));

DOM.buttons.start.addEventListener("click", handleStartClick);
DOM.buttons.stop.addEventListener("click", handleStopClick);
DOM.buttons.reset.addEventListener("click", handleResetClick);

DOM.menus.name.addEventListener("input", e => {
    if (STATE.selectedRect) {
        STATE.selectedRect.name = e.target.value;
    }
});

DOM.jointMenus.jointName.addEventListener("input", e => {
    if (STATE.selectedJoint) {
        STATE.selectedJoint.name = e.target.value;
    }
});

DOM.menus.groupBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        if (!STATE.selectedRect) return;

        STATE.selectedRect.group = Number(btn.dataset.group);
        DOM.menus.rectSelectMenu.style.display = "none";
    });
});

DOM.jointMenus.jointTypeChangers.forEach(btn => {
    btn.addEventListener("click", () => {
        const oldOptions = STATE.selectedJoint.options;
        const type = btn.dataset.joint;
        changeJointType(STATE.selectedJoint, type, oldOptions);
        DOM.jointMenus.jointSelectMenu.style.display = "none";
    });
});

DOM.jointMenus.sliders.speedSlider.addEventListener("input", e => {
    const settingSpeed = Number(e.target.value);
    DOM.jointMenus.sliders.values.speedValue.textContent = settingSpeed;
    changeJointSpeed(STATE.selectedJoint, settingSpeed);
});

DOM.jointMenus.sliders.torqueSlider.addEventListener("input", e => {
    const settingTorque = Number(e.target.value);
    DOM.jointMenus.sliders.values.torqueValue.textContent = settingTorque;
    changeJointTorque(STATE.selectedJoint, settingTorque);
});

DOM.buttons.delete.addEventListener("click", handleDeleteClick);
DOM.buttons.jointDelete.addEventListener("click", handleJointDeleteClick);

DOM.buttons.load.addEventListener("click", handleLoadClick);
DOM.buttons.loader.addEventListener("click", handleLoaderClick);

function loop() {
    if (STATE.mode === "edit") {
        DOM.ctx.editCtx.clearRect(0, 0, DOM.editScene.width, DOM.editScene.height);
        drawRects();
        drawJoints();
        drawGrid();
    } else if (STATE.mode === "run") {
        if (STATE.modeInRun === "start") {
            physics.world.step(1 / 60);
        }
        DOM.ctx.runCtx.clearRect(0, 0, DOM.runScene.width, DOM.runScene.height);
        DOM.ctx.runCtx.strokeStyle = "white";
        DOM.ctx.runCtx.lineWidth = 4;
        DOM.ctx.runCtx.strokeRect(0, 0, DOM.runScene.width, DOM.runScene.height);
        DOM.ctx.runCtx.lineWidth = 1;
        DOM.ctx.runCtx.strokeRect(150, 500, 500, 120);
        drawRunObjects();
    }
    requestAnimationFrame(loop);
}

loop();