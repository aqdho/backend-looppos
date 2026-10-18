const express = require("express");
const router = express.Router();

const agents = require("../print-manager/agentStore");

// =========================
// REGISTER DEVICE
// =========================

router.post("/register", (req, res) => {
    try {
        const {
            device_id,
            printers,
            agent_url
        } = req.body;

        if (!device_id) {
            return res.status(400).json({
                status: "error",
                pesan: "device_id wajib diisi"
            });
        }

        agents.set(device_id, {
            device_id,
            agent_url: agent_url || null,
            printers: Array.isArray(printers)
                ? printers
                : [],
            last_seen: new Date()
        });

        console.log(
            "PRINT AGENT TERDAFTAR:",
            device_id
        );

        console.log(
            "PRINTER:",
            printers
        );

        res.json({
            status: "ok",
            pesan: "Print Agent berhasil terdaftar",
            device_id
        });

    } catch (error) {
        console.error(
            "ERROR REGISTER PRINT AGENT:",
            error
        );

        res.status(500).json({
            status: "error",
            pesan: "Gagal mendaftarkan Print Agent"
        });
    }
});

// =========================
// DAFTAR AGENT
// =========================

router.get("/agents", (req, res) => {
    res.json({
        status: "Ok",
        agents: Array.from(agents.values())
    });
});

router.get("/printers", (req, res) => {
    const printers = [];

    for (const agent of agents.values()) {
        for (const printer of agent.printers) {
            printers.push({
                device_id: agent.device_id,
                printer,
                agent_url: agent.agent_url
            });
        }
    }

    res.json({
        status: "ok",
        printers
    });
});

// =========================
// AMBIL AGENT
// =========================

router.get("/agent/:device_id", (req, res) => {
    const deviceId =
        req.params.device_id;

    const agent =
        agents.get(deviceId);

    if (!agent) {
        return res.status(404).json({
            status: "error",
            pesan: "Print Agent tidak ditemukan"
        });
    }

    res.json({
        status: "ok",
        agent
    });
});



router.post("/heartbeat", (req, res) => {
    const {
        device_id,
        printers
    } = req.body;

    if (!device_id) {
        return res.status(400).json({
            status: "error",
            pesan: "device_id wajib diisi"
        });
    }

    const agent =
        agents.get(device_id);

    if (!agent) {
        return res.status(404).json({
            status: "error",
            pesan: "Print Agent belum terdaftar"
        });
    }

    agent.printers =
        Array.isArray(printers)
            ? printers
            : agent.printers;

    agent.last_seen =
        new Date();

    agents.set(
        device_id,
        agent
    );

    res.json({
        status: "ok",
        pesan: "Heartbeat diterima"
    });
});

module.exports = router;
