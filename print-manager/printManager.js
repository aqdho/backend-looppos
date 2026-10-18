const http = require("http");
const https = require("https");

const agents =
    require("./agentStore");

const DEFAULT_DEVICE_ID = "device-001";

const printManager = {
    print: (
        struk,
        printer = null,
        device_id = DEFAULT_DEVICE_ID
    ) => {
        return new Promise((resolve, reject) => {

            if (!struk) {
                return reject(
                    new Error("Data struk kosong")
                );
            }

            const data = JSON.stringify({
                struk,
                printer,
            });

            let agent = null;

            // =========================
            // CARI PRINT AGENT
            // =========================

            if (device_id) {

                agent = agents.get(device_id);

            } else if (printer) {

                const candidates = [];

                for (const registeredAgent of agents.values()) {

                    if (
                        Array.isArray(
                            registeredAgent.printers
                        ) &&
                        registeredAgent.printers.includes(
                            printer
                        )
                    ) {
                        candidates.push(
                            registeredAgent
                        );
                    }
                }

                if (candidates.length === 1) {

                    agent = candidates[0];

                } else if (candidates.length > 1) {

                    return reject(
                        new Error(
                            `Printer ${printer} terdaftar di lebih dari satu Print Agent`
                        )
                    );
                }
            }

            // =========================
            // AGENT TIDAK DITEMUKAN
            // =========================

            if (!agent) {

                return reject(
                    new Error(
                        printer
                            ? `Printer ${printer} tidak ditemukan`
                            : "Print Agent tidak ditemukan"
                    )
                );
            }

            // =========================
            // CEK PRINTER
            // =========================

            if (
                printer &&
                (
                    !Array.isArray(agent.printers) ||
                    !agent.printers.includes(printer)
                )
            ) {

                return reject(
                    new Error(
                        `Printer ${printer} tidak tersedia pada Print Agent ${agent.device_id}`
                    )
                );
            }

            // =========================
            // CEK AGENT URL
            // =========================

            if (!agent.agent_url) {

                return reject(
                    new Error(
                        `Print Agent ${agent.device_id} belum memiliki agent_url`
                    )
                );
            }

            // =========================
            // AGENT URL
            // =========================

            const agentUrl =
                new URL(agent.agent_url);

            const options = {
                hostname:
                    agentUrl.hostname,

                port:
                    agentUrl.port ||
                    (
                        agentUrl.protocol === "https:"
                            ? 443
                            : 80
                    ),

                path: "/print",

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Content-Length":
                        Buffer.byteLength(data),
                },
            };

            // =========================
            // HTTP / HTTPS
            // =========================

            const protocol =
                agentUrl.protocol === "https:"
                    ? https
                    : http;

            const request =
                protocol.request(
                    options,
                    (response) => {

                        let body = "";

                        response.on(
                            "data",
                            (chunk) => {
                                body +=
                                    chunk.toString();
                            }
                        );

                        response.on(
                            "end",
                            () => {

                                try {

                                    const result =
                                        JSON.parse(
                                            body
                                        );

                                    if (
                                        response.statusCode <
                                            200 ||
                                        response.statusCode >=
                                            300
                                    ) {

                                        return reject(
                                            new Error(
                                                result.pesan ||
                                                "Print Agent gagal mencetak"
                                            )
                                        );
                                    }

                                    resolve({
                                        status: "ok",

                                        pesan:
                                            result.pesan ||
                                            "Struk berhasil dicetak",

                                        printer:
                                            result.printer ||
                                            printer,
                                    });

                                } catch (error) {

                                    reject(
                                        new Error(
                                            "Response Print Agent tidak valid"
                                        )
                                    );
                                }
                            }
                        );
                    }
                );

            // =========================
            // ERROR CONNECTION
            // =========================

            request.on(
                "error",
                (error) => {

                    reject(
                        new Error(
                            "Print Agent tidak terhubung: " +
                            error.message
                        )
                    );
                }
            );

            request.write(data);
            request.end();
        });
    },
};

module.exports = printManager;
