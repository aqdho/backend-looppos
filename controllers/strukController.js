const pool = require("../config/database");
const printManager = require("../print-manager/printManager");

const JENIS_STRUK = ["users", "table", "kitchen"];

function formatRupiah(nilai) { 
    return `Rp ${Number(nilai || 0).toLocaleString("id-ID")}`;
}

function formatTunggal(nilai) { 
    if (!nilai) return "-";

    return new Date(nilai).toLocaleString("id-ID", { 
        timeZone: "Asia/Jakarta", 
    });
}

function bungkusTeks(teks, lebar) {
    const kata = String(teks || "").split(/\s+/);
    const baris = [];
    let sekarang = "";

    for (const item of kata) {
        if (!item) continue;

        if (item.length > lebar) {
            if (sekarang) {
                baris.push(sekarang);
                sekarang = "";
            }

            for (let i = 0; i < item.length; i += lebar) {
                baris.push(item.slice(i, i + lebar));
            }

            continue;
        }

        const gabungan = sekarang
            ? `${sekarang} ${item}`
            : item;

        if (gabungan.length > lebar) {
            baris.push(sekarang);
            sekarang = item;
        } else {
            sekarang = gabungan;
        }
    }

    if (sekarang) baris.push(sekarang);

    return baris;
}

function buatStruk({
    settings,
    transaksi,
    items,
    jenisStruk,
}) {
    const ukuranKertas = String(
        settings.ukuran_kertas || "58mm"
    ).toLowerCase();

    const lebar = ukuranKertas === "80mm" ? 48 : 32;
    const garis = "-".repeat(lebar);
    const baris = ["\x1B\x40"];

    const tengah = (teks) => {
        const value = String(teks || "");
        if (value.length >= lebar) return value;

        return (
            " ".repeat(Math.floor((lebar - value.length) / 2)) +
            value
        );
    };

    const tambahBarisTengah = (teks) => {
        for (const barisTeks of bungkusTeks(teks, lebar)) {
            baris.push(tengah(barisTeks));
        }
    };

    const tambahHeader = () => {
        baris.push("\x1B\x61\x01");

        if (settings.tampil_nama && settings.nama_toko) {
            tambahBarisTengah(settings.nama_toko);
        }

        if (settings.tampil_alamat && settings.alamat_toko) {
            tambahBarisTengah(settings.alamat_toko);
        }

        if (settings.tampil_telepon && settings.telepon_toko) {
            tambahBarisTengah(settings.telepon_toko);
        }

        baris.push("");
    };

    const tambahTanggal = () => {
    if (settings.tampil_tanggal) {
        baris.push(formatTunggal(transaksi.tanggal));
    }
};
    const tambahProduk = ({ tanpaHarga = false } = {}) => {
    baris.push("\x1B\x61\x00");
    baris.push(garis);

    for (const item of items) {
        const nama = String(item.nama || "Produk");
        const qty = Number(item.qty || 0);

        baris.push(...bungkusTeks(nama, lebar));

        if (tanpaHarga) {
            baris.push(...bungkusTeks(`Jumlah: ${qty}`, lebar));
            continue;
        }

        const labelQty = `x${qty}`;
        const subtotal = formatRupiah(item.subtotal);

        if (labelQty.length + subtotal.length + 1 <= lebar) {
            const spasi = lebar - labelQty.length - subtotal.length;
            baris.push(`${labelQty}${" ".repeat(spasi)}${subtotal}`);
        } else {
            baris.push(...bungkusTeks(labelQty, lebar));
            baris.push(...bungkusTeks(subtotal, lebar));
        }
    }

    baris.push(garis);
};

    tambahHeader();

    if (jenisStruk === "users") {
        baris.push(tengah("BUKTI PEMBAYARAN"));
        baris.push(`Transaksi: #${transaksi.id}`);
        tambahTanggal();

        tambahProduk();

        const total = Number(transaksi.total || 0);
        const bayar = Number(transaksi.bayar || 0);
        const kembali = Math.max(0, bayar - total);

        baris.push(`Total: ${formatRupiah(total)}`);
        baris.push(`Bayar: ${formatRupiah(bayar)}`);
        baris.push(`Kembali: ${formatRupiah(kembali)}`);

        if (settings.pesan_struk) {
            baris.push(garis);
            baris.push("\x1B\x61\x01");
            tambahBarisTengah(settings.pesan_struk);
        }
    } else if (jenisStruk === "table") {
        baris.push(tengah("PESANAN DINE IN"));
        baris.push(`Pesanan: #${transaksi.id}`);
        tambahTanggal();

        tambahProduk();

        baris.push(`Total tagihan: ${formatRupiah(transaksi.total)}`);
        baris.push("");
        baris.push(tengah("BILL PESANAN"));
    } else {
        baris.push(tengah("TIKET DAPUR"));
        baris.push(`Pesanan: #${transaksi.id}`);
        tambahTanggal();

        tambahProduk({ tanpaHarga: true });

        baris.push(tengah("MOHON DIPROSES"));
    }

    baris.push("", "", "");

    return {
        isi: baris.join("\n") + "\n",
        ukuranKertas: settings.ukuran_kertas || "58mm",
    };
}

async function cetakStruk(req, res) {
    try {
        const {
            transaksi_id,
            device_id,
            printer,
        } = req.body;

        const jenisStruk = req.body.jenis_struk || "users";

        const transaksiId = Number(transaksi_id);

        if ( 
            transaksi_id === undefined || 
            transaksi_id === null ||
            String(transaksi_id).trim() === "" ||
            !Number.isSafeInteger(transaksiId) ||
            transaksiId <= 0
        ) { 
            return res.status(400).json({ 
                pesan: "ID transaksi tidak valid.", 
            });
        }

        if (!JENIS_STRUK.includes(jenisStruk)) {
            return res.status(400).json({
                pesan: "Jenis struk tidak valid. Pilih users, table, atau kitchen.",
            });
        }

        // Ambil pemilik toko dari akun yang sedang login.
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                pesan: "Pengguna tidak ditemukan.",
            });
        }

        const user = userResult.rows[0];

        if (!["owner", "kasir"].includes(user.role)) { 
            return res.status(403).json({ 
                pesan: "Role pengguna tidak diizinkan mencetak struk.", 
            });
        }

        const ownerId = 
            user.role === "owner"
                ? user.id 
                : user.owner_id; 
                
        if (!ownerId) {
            return res.status(403).json({
                pesan: "Pemilik toko tidak ditemukan.",
            });
        }

        if (user.role === "kasir") { 
            const ownerResult = await pool.query( 
                `SELECT id
                FROM users
                WHERE id = $1
                    AND role = 'owner'`,
                [ownerId]
            );

            if (ownerResult.rows.length === 0) { 
                return res.status(403).json({ 
                    pesan: "Akun pemilik toko tidak valid.",
                });
            }
        }

        const settingsResult = await pool.query(
            `SELECT
                nama_toko,
                alamat_toko,
                telepon_toko,
                pesan_struk,
                tampil_nama,
                tampil_alamat,
                tampil_telepon,
                tampil_tanggal,
                ukuran_kertas
             FROM settings
             WHERE user_id = $1`,
            [ownerId]
        );

        if (settingsResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "Pengaturan toko tidak ditemukan.",
            });
        }

        const transaksiResult = await pool.query(
            `SELECT
                id,
                tanggal,
                total,
                bayar,
                mode_pesanan,
                payment_status
            FROM transaksi
            WHERE id = $1
            AND user_id = $2`,
            [transaksiId, ownerId]
        );

        if (transaksiResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan atau akses ditolak.",
            });
        }

        const transaksi = transaksiResult.rows[0];

        if ( 
            jenisStruk === "users" && 
            transaksi.payment_status && 
            transaksi.payment_status !== "paid"
        ) { 
            return res.status(400).json({ 
                pesan: "Pembayaran belum berhasil. Struk pembayaran belum dapat dicetak.",
                status: "payment_pending",
            });
        }

        if (
            jenisStruk === "table" &&
            (transaksi.mode_pesanan || "dine_in") !== "dine_in"
        ) {
            return res.status(400).json({
                pesan: "Struk meja hanya tersedia untuk pesanan dine-in.",
            });
        }

        const detailResult = await pool.query(
            `SELECT
                p.nama,
                td.qty,
                td.harga,
                td.subtotal
            FROM transaksi_detail td
            JOIN products p
            ON p.id = td.produk_id
            AND p.user_id = $2
            WHERE td.transaksi_id = $1
            ORDER BY td.id ASC`,
            [transaksi.id, ownerId]
        );

        if (detailResult.rows.length === 0) { 
            return res.status(400).json({ 
                pesan: "Detail produk transaksi tidak ditemukan. Struk tidak dapat dicetak.",
            });
        }

        const hasil = buatStruk({
            settings: settingsResult.rows[0],
            transaksi,
            items: detailResult.rows,
            jenisStruk,
        });

        try { 
            await printManager.print( 
                hasil.isi,
                printer,
                device_id
            );
        } catch (printError) { 
            console.error("ERROR CETAK PRINTER:", printError);

            return res.status(503).json({ 
                pesan: "Struk disiapkan, tetapi gagal dikirim ke printer.",
                status: "print_failed", 
            });
        }
        
        return res.json({
            pesan: "Struk berhasil dicetak.",
            status: "ok",
            jenis_struk: jenisStruk,
            ukuran_kertas: hasil.ukuranKertas,
        });
    } catch (error) {
        console.error("ERROR PROSES STRUK:", error);

        return res.status(500).json({
            pesan: "Terjadi kesalahan saat memproses struk.",
        });
    }
}

module.exports = {
    cetakStruk,
};