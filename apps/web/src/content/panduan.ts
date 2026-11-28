import type { Role } from "@estrada/domain";

/**
 * The in-app user guide (Panduan), in Markdown. Update it in the same change as any behaviour a user can see:
 * panduan.test.ts fails when a menu screen, an approval state or a role is missing from it.
 * "[[alur]]" on its own line draws the approval flow diagram.
 */
export const PANDUAN = String.raw`
ERP Estrada adalah ERP Estrada Group: anggaran (RKA), pipeline penjualan, implementasi proyek, pembayaran, arus kas dan COA dalam satu aplikasi. Modul RKA menggantikan workbook RKA 2027: setiap baris anggaran melewati enam tahap, dari Draft sampai Terkunci, dan di setiap tahap hanya satu peran yang dapat bertindak. Panduan ini mengikuti aplikasi yang berjalan sekarang.

## Alur RKA

[[alur]]

Hanya peran yang tertulis di kotak yang dapat bertindak atas baris di tahap itu. Mengembalikan atau meminta klarifikasi wajib disertai catatan. Versi yang sudah dikunci hanya berubah lewat revisi.

| Tahap | Dipegang oleh | Tindakan berikutnya |
| --- | --- | --- |
| Draft | Requestor | Kirim ke Default Owner |
| Konsolidasi | Default Owner | Kirim ke Division Owner, atau Kembalikan ke Draft |
| Persetujuan Divisi | Division Owner | Setujui & kirim ke Finance, atau Kembalikan ke Konsolidasi |
| Review Finance | Finance Reviewer | Finalisasi, atau Minta klarifikasi ke Persetujuan Divisi |
| Menunggu Kunci | Finance Reviewer | Kunci versi |
| Terkunci | Semua hanya membaca | Perubahan lewat revisi |

## COA pada baris RKA

Akun induk (yang punya akun turunan) tidak menerima baris RKA baru, dan baris tidak dapat dipindahkan ke sana. Baris lama dari workbook yang sudah berada di akun induk tetap dapat disunting sampai dipindahkan ke akun turunan. Kode di luar COA Structured RKA 2027 yang masih dipakai baris ditandai sementara dan nonaktif; Finance Reviewer memindahkan barisnya di *COA Master*.

## Peran dan akses

Setiap pengguna memegang posisi: peran, unit organisasi, dan entitas yang boleh dilihat. Cakupan posisi meliputi unitnya dan semua unit di bawahnya. Finance Reviewer, Direktur, Auditor dan Admin melihat seluruh perusahaan.

| Peran | Menu | Boleh mengubah baris | Tindakan persetujuan |
| --- | --- | --- | --- |
| Requestor | Beranda, RKA Saya, Permintaan Pembayaran, Master Data, Panduan | Baris unitnya selama Draft | Kirim ke Default Owner |
| Default Owner | Beranda, RKA Saya, Antrean Konsolidasi, Monitor Anggaran, Analisis Varians, Permintaan Pembayaran, Peringatan Dini, Register Risiko, Master Data, Panduan | Baris dalam cakupannya selama Konsolidasi | Kirim ke Division Owner, Kembalikan (catatan wajib) |
| Division Owner | Beranda, RKA Divisi, Monitor Anggaran, Analisis Varians, Permintaan Pembayaran, Management Summary, Peringatan Dini, Register Risiko, Master Data, Panduan | Tidak | Setujui & kirim ke Finance, Kembalikan ke Default Owner (catatan wajib) |
| Finance Reviewer | Beranda, Status Board Finance, Daftar Baris RKA, Kunci RKA, Siklus RKA, Monitor Anggaran, Analisis Varians, Permintaan Pembayaran, Rekap Pembayaran, Hutang, Invoice, Piutang, Pajak, Tracker Telkom, Implementasi, Pengadaan, Management Summary, Laba Rugi, Tutup Buku, Target KPI, Kesehatan KPI, Laporan Berkala, Pipeline, SPH, Portofolio Proyek, Profitabilitas Proyek, Arus Kas, Skenario, Kas Mingguan, Obligo Bank, Peringatan Dini, Register Risiko, Master Data, Persetujuan Master, Realisasi, Biaya Bersama, COA Master, Kepatuhan, Panduan | Baris di Review Finance | Minta klarifikasi (catatan wajib), Finalisasi, Kunci versi |
| Business Finance (BFP) | Beranda, Permintaan Pembayaran, Rekap Pembayaran, Hutang, Invoice, Piutang, Pengadaan, SPH, Master Data, Panduan | Tidak | Memeriksa Permintaan Pembayaran (lihat bagian Permintaan Pembayaran) |
| Cash Management | Beranda, Permintaan Pembayaran, Rekap Pembayaran, Hutang, Rekening Bank, Invoice, Piutang, Tracker Telkom, Kas Mingguan, Obligo Bank, Peringatan Dini, Master Data, Panduan | Tidak | Menjadwalkan dan membayar Permintaan Pembayaran |
| Direktur | Beranda, Kunci RKA, Siklus RKA, Monitor Anggaran, Analisis Varians, Permintaan Pembayaran, Rekap Pembayaran, Hutang, Invoice, Piutang, Pajak, Tracker Telkom, Implementasi, Pengadaan, Dashboard BOD, Management Summary, Laba Rugi, Tutup Buku, Target KPI, Kesehatan KPI, Laporan Berkala, Pipeline, SPH, Portofolio Proyek, Profitabilitas Proyek, Arus Kas, Skenario, Kas Mingguan, Obligo Bank, Peringatan Dini, Register Risiko, Master Data, Persetujuan Master, Kepatuhan, Audit Log, Panduan | Tidak | Tidak ada, hanya membaca |
| Auditor | Beranda, Monitor Anggaran, Analisis Varians, Permintaan Pembayaran, Rekap Pembayaran, Hutang, Invoice, Piutang, Pajak, Tracker Telkom, Implementasi, Pengadaan, Dashboard BOD, Management Summary, Laba Rugi, Tutup Buku, Target KPI, Kesehatan KPI, Laporan Berkala, Pipeline, SPH, Portofolio Proyek, Profitabilitas Proyek, Arus Kas, Skenario, Kas Mingguan, Obligo Bank, Peringatan Dini, Register Risiko, Master Data, Persetujuan Master, Kepatuhan, Audit Log, Panduan | Tidak | Tidak ada, membaca semua termasuk jejak audit |
| Admin | Beranda, Rekening Bank, Master Data, Persetujuan Master, Kepatuhan, Audit Log, Pengguna, Unit & Entitas, Struktur Organisasi, Panduan | Tidak | Tidak ada; tidak melihat angka anggaran |

Menu tambahan menurut unit: orang BCD (Requestor, Default Owner, Division Owner) juga melihat Pipeline dan SPH; orang BCD, PDMS (PMO, SCM, ISO, MSO) dan Legal & Contract Management (FRM-LCM) dengan peran yang sama juga melihat Implementasi; orang PDMS juga Pengadaan. Orang BCD, PDMS, FRM-LCM, FRM-FIN-ATM dan Division Owner FRM melihat Tracker Telkom. Unit Accounting & Tax Management (FRM-FIN-ATM) dengan peran yang sama melihat Invoice, Piutang, Pajak, Laba Rugi dan Tutup Buku, dan Requestor-nya juga Monitor Anggaran. Orang PMO dengan peran Requestor, Default Owner atau Division Owner juga melihat Obligo Bank. Division Owner FRM juga melihat Target KPI, Kesehatan KPI, Laporan Berkala, Dashboard BOD, Portofolio Proyek, Profitabilitas Proyek, Pengadaan, Invoice, Piutang, Pajak, Laba Rugi, Tutup Buku, Kas Mingguan, Obligo Bank, Persetujuan Master dan Kepatuhan. Setiap halaman dan tindakan diperiksa di server sesuai aturan ini, jadi menu yang tersembunyi bukan satu-satunya pengaman. Semua peran melihat menu Panduan.

## Memulai

- **Masuk**: gunakan email kantor dan kata sandi. Akun dibuat oleh Admin lewat undangan email; tidak ada pendaftaran mandiri. *Lupa kata sandi?* mengirim tautan untuk membuat kata sandi baru.
- **Beranda**: ringkasan untuk peran Anda. Tiga kartu di atas menunjukkan *Menunggu tindakan Anda* (baris di antrean Anda), *Batas pengajuan* (sisa hari) dan *Sudah final* (porsi baris yang sudah difinalisasi atau dikunci). Di bawahnya ada tombol ke layar kerja Anda, daftar *Belum final* (jumlah baris per tahap, peran yang memegangnya dan divisinya; daftar ini naik ke atas tombol bila tidak ada yang menunggu Anda; Requestor, Default Owner dan Finance dapat mengkliknya untuk membuka baris itu), *Posisi RKA*, serta *Aktivitas terbaru* (baris yang dipindahkan sekaligus diringkas menjadi satu entri). *Posisi RKA* berupa tabel: satu baris per divisi, satu kolom per tahap (Draft sampai Terkunci) berisi jumlah baris, lalu total baris dan porsi yang sudah final.
- **Menu**: dikelompokkan menjadi Anggaran, Pembayaran, Penagihan, Proyek, Kinerja, Penjualan, Kas, Kontrol, Data dan Admin (hanya yang berisi layar Anda). Tombol panah di samping logo melipat menu menjadi ikon; pilihan ini diingat. Hanya kelompok halaman yang sedang dibuka yang terbuka; klik judul kelompok untuk membuka atau menutup yang lain.
- **Lewati ke isi**: tekan Tab sekali setelah halaman terbuka untuk melompati menu. Tabel yang lebih lebar dari layar dapat dipilih dengan Tab lalu digeser dengan tombol panah.
- **Belum final** (Beranda): menunjukkan berapa hari baris terlama diam di tiap tahap dan divisi, serta sisa hari batas pengajuan.
- **Daftar baris**: tiap baris menyebut unit pemilik (dan peminta bila berbeda); saring dengan **Divisi**. Total, Actual dan Perubahan tampil sebelum kolom bulan.
- **Tanpa pendapatan**: bila RKA belum memuat pendapatan, Arus Kas dan kartu Arus kas di Beranda memberi peringatan bahwa saldo hanya mencerminkan biaya.
- **Lokasi**: di layar lebar, baris di atas judul halaman menulis kelompok menu dan nama layar; pada halaman rincian, nama layar menjadi tautan kembali.
- **Tabel panjang** (COA Master, Realisasi, Biaya Bersama, Pipeline) digulir di dalam kotaknya sendiri dengan judul kolom tetap terlihat; gunakan kotak cari di atasnya.
- **Posisi aktif**: pengguna yang memegang lebih dari satu posisi, atau menjadi pjs, berganti posisi lewat menu akun (pojok kanan atas), bagian *Posisi aktif*. Menu, cakupan dan antrean mengikuti posisi yang aktif.
- **Tampilan** (tombol di kepala halaman, misalnya *RKA 2027 · MATRIK · Juta*): klik untuk mengatur *Tahun anggaran*, *Entitas*, *Divisi* dan *Satuan*. Pengaturan berlaku untuk semua layar dan diingat per pengguna; tombol diberi warna saat entitas atau divisi dipersempit. Tahun standarnya tahun yang sedang terbuka; tahun yang sudah dikunci bertanda *(terkunci)* dan tetap dapat dibaca. Angka pembanding selalu dari tahun sebelumnya: membuka RKA 2028 menampilkan RKA 2027 dan Actual 2027. Entitas dan Divisi hanya mempersempit baris yang memang boleh Anda lihat; bila cakupan Anda hanya satu entitas atau satu divisi, namanya tampil tanpa pilihan. Divisi mengikuti unit Default Owner baris. Di ponsel tombol hanya menampilkan tahun dan jumlah filter yang aktif.
- **Filter aktif**: setiap layar yang dipersempit menulis *Filter aktif: …* di bawah judul, dengan tautan *Tampilkan semua* untuk kembali ke Semua entitas dan Semua divisi. Layar yang tidak memakai salah satunya menyebutkannya, misalnya Divisi di Arus Kas dan Pipeline. Kolom yang isinya sama di setiap baris karena filter (Entitas, atau Pemilik bila divisi hanya punya satu unit) disembunyikan.
- **Baris baru**: di RKA Saya, baris baru memakai entitas dari Tampilan di kepala halaman dan tetap dapat diubah. Draft Anda selalu tampil semua di editor; filter hanya mempersempit daftar *Sudah dikirim*.
- **Tema**: pilih Terang, Gelap atau Ikuti sistem di menu akun, bagian *Tema*.
- **Menu akun**: tombol di pojok kanan atas menunjukkan jabatan dan peran yang aktif. Isinya nama dan email Anda, *Posisi aktif* (bila lebih dari satu), *Tema*, dan *Keluar* untuk mengakhiri sesi.
- **Memuat halaman**: saat pindah halaman, garis tipis di paling atas menunjukkan halaman sedang dimuat.
- **Ponsel**: di layar kecil menu menjadi tombol *Menu*. Setiap layar muat di ponsel tanpa geser ke samping.

## Persiapan siklus

Siklus dapat dibuka setelah pengguna, posisi, COA dan (bila ada) baris dari workbook siap. Lakukan berurutan.

1. **Admin mengundang pengguna** (Pengguna, *Undang pengguna*): nama, email, peran, unit, jabatan dan entitas (centang satu per satu, atau *Semua entitas*). Pengguna menerima email untuk membuat kata sandi.
2. **Admin menyiapkan posisi** (Struktur Organisasi): jabatan, peran, unit dan entitas. Bila pemegangnya berhalangan, Admin menetapkan Pejabat sementara (pjs). Unit dan entitas sendiri dikelola di Unit & Entitas.
3. **Finance merawat COA Master**: kode, nama, kategori, default owner, induk dan status aktif.
4. **Workbook diimpor** oleh tim teknis. Semua baris, nominal Jan sampai Des, dasar perhitungan dan catatannya masuk, termasuk baris rekrutmen sebagai rencana headcount, Pipeline, asumsi arus kas dan pinjaman. Kode yang belum ada di COA Master masuk sebagai kode sementara untuk diputuskan Finance.
5. **Finance membuka siklus** (Siklus RKA, *Buka siklus baru*): tahun anggaran, nama versi dan Batas pengajuan (pukul 17.00 WIB; standarnya 31 Desember tahun berjalan). *Mulai dari* memilih titik awal: **Kosong**, atau RKA tahun lalu yang terkunci (*salin baris sebagai Draft*). Bila disalin, setiap baris tahun lalu menjadi Draft di unitnya dengan nominal bulan yang sama untuk disesuaikan, total tahun lalu menjadi pembanding RKA, dan rencana headcount serta dasar biaya bersama ikut. *Buka siklus dan kirim email ke requestor* membuka versi di Draft dan mengirim email ke semua Requestor.

Hanya satu versi per tahun anggaran yang dapat terbuka. Tahun baru baru dapat dibuka setelah versi pertama tahun sebelumnya dikunci; dua tahun hanya terbuka bersamaan bila yang satu sedang direvisi.

## Requestor: isi dan kirim

Requestor mengisi baris anggaran unitnya selama Draft, lalu mengirimnya ke Default Owner. Mulai dari Beranda atau menu RKA Saya.

RKA Saya hanya menampilkan baris yang diusulkan unit Anda sendiri, dalam entitas yang menjadi akses Anda. Baris unit lain yang dibebankan ke unit Anda tidak tampil di sini.

Di bagian atas ada ringkasan: **Sudah dikirim** (jumlah baris yang sudah Anda kirim) dan posisinya per tahap, yaitu Konsolidasi (di Default Owner), Persetujuan Divisi (di Division Owner), Review Finance, Menunggu Kunci dan Terkunci. Bila ada baris yang dikembalikan, tampil *N baris dikembalikan, perlu diubah*; bila ada baris yang punya komentar, tampil *N baris punya diskusi*.

Di bawahnya ada tiga bagian: **Draft usulan** (baris yang masih bisa diubah), **Rencana headcount** (rekrutmen baru yang menjadi baris gaji) dan **Sudah dikirim** (baris yang sudah dikirim beserta tahapnya, hanya baca). Daftar ini tampil 50 baris per halaman; pindah halaman dengan *Sebelumnya* dan *Berikutnya* di bawah tabel. Baris Total tetap menjumlahkan semua baris, bukan hanya halaman yang tampil.

**Mengisi baris di Draft usulan**

1. *Tambah baris* membuka baris baru di COA biaya pertama yang masih kosong untuk Entitas Anda, dengan Pemilik sesuai default owner COA itu. Pilih COA, isi Uraian, Entitas dan Pemilik (unit pemilik biaya; boleh unit lain); mengganti COA ikut mengganti Pemilik ke default owner COA tersebut, jadi periksa lagi.
2. Ketik nominal Jan sampai Des dalam rupiah. Sel bulan tampil seperti spreadsheet: tanpa garis sampai disentuh, dan berbingkai biru saat diisi. Total RKA dihitung otomatis.
3. Untuk menyalin dari Excel, tempel satu baris atau satu blok ke sel bulan; nilainya mengisi bulan ke kanan dan baris ke bawah.
4. Tombol *Isi ke kanan* menyalin bulan yang dipilih sampai Des. Panah atas dan bawah berpindah baris.
5. **Bagi rata 12 bulan**: ketik total setahun sekali di kotak *Bagi rata 12 bln* di kolom Total RKA, lalu tekan Enter atau pindah ke kolom lain. Total dibagi rata ke Jan sampai Des; sisa pembulatan masuk ke Des supaya jumlahnya tepat. Setelah itu tiap bulan tetap bisa diubah satu per satu.
6. Isi Dasar perhitungan. Baris tidak tersimpan bila COA tidak aktif atau tidak dikenal, COA itu akun Neraca atau Pajak (RKA hanya menganggarkan Revenue, COGS, OPEX, OTHERS dan CAPEX), entitas tidak dikenal, atau ada nominal negatif.
7. **Satu COA sekali per Entitas dan Pemilik.** COA yang sama tidak bisa dimasukkan dua kali untuk Entitas dan Pemilik yang sama; di daftar COA, kode yang sudah dipakai baris lain tampil abu-abu dengan keterangan *(sudah dipakai)*. Ubah baris yang sudah ada. COA yang sama boleh untuk Entitas lain atau Pemilik lain. Baris dari Rencana headcount dikecualikan, dan baris ganda yang sudah ada dari impor workbook tetap bisa diubah.
8. Baris yang berubah diberi warna. Bilah di bawah menunjukkan *N baris belum disimpan*; tekan *Simpan (N)* untuk menyimpan semuanya sekaligus. *Hapus baris* menghapus baris yang tidak diperlukan.

Catatan dari workbook dan angka tahun lalu terlipat di tautan kecil di bawah uraian (misalnya *2 catatan*); klik untuk membukanya. Catatan pengembalian dari Default Owner selalu tampil.

**Rencana headcount**: jabatan, jumlah orang, biaya per orang per bulan, bulan mulai, COA dan entitas. Aplikasi menulis baris gajinya: nol sampai bulan mulai, lalu jumlah orang dikali biaya setiap bulan sampai Des. Baris itu bertanda *Dihitung dari Rencana headcount*; ubah rencananya, bukan barisnya.

**Mengirim**: centang baris yang sudah tersimpan, lalu tekan *Kirim ke Default Owner*. Setiap baris pergi ke Default Owner unit pemiliknya; satu email per Default Owner, berapa pun barisnya.

**Bila dikembalikan**, baris kembali ke Draft usulan dengan catatan Default Owner di atasnya. Perbaiki lalu kirim lagi. Menjelang Batas pengajuan, aplikasi mengirim email pengingat 7, 3 dan 1 hari sebelumnya bila masih ada baris yang belum dikirim.

## Default Owner: konsolidasi atau kembalikan

Default Owner memeriksa baris yang dikirim unitnya, lalu meneruskannya ke Division Owner atau mengembalikannya. Buka menu Antrean Konsolidasi.

1. Antrean menampilkan setiap baris di Konsolidasi dalam cakupan Anda: COA, unit pengusul, entitas, dasar perhitungan, Total RKA, Actual tahun lalu, perubahan terhadap tahun lalu dan status.
2. Persempit dengan *Filter COA*; memilih kode induk juga menampilkan kode anaknya.
3. Selama di Konsolidasi, baris masih bisa dikoreksi.
4. Centang baris, lalu pilih *Kirim ke Division Owner* atau *Kembalikan*. Mengembalikan wajib disertai catatan, yang dibaca Requestor di baris dan di email.

Default Owner juga punya RKA Saya untuk mengusulkan baris unitnya sendiri.

## Division Owner: setujui divisi

Division Owner menyetujui baris departemen di divisinya dan mengirimnya ke Finance; nominal tidak bisa diubah di tahap ini. Buka menu RKA Divisi.

1. Daftar menampilkan baris di Persetujuan Divisi dari semua unit di divisi Anda, dengan kolom dan *Filter COA* yang sama.
2. Buka baris untuk membaca bulan, dasar perhitungan dan riwayatnya. Untuk bertanya tanpa memindahkan baris, gunakan Diskusi.
3. Centang baris lalu tekan *Setujui & kirim ke Finance*.
4. Bila baris perlu diperbaiki, centang lalu tekan *Kembalikan* dengan catatan wajib. Baris kembali ke Konsolidasi di Default Owner unit pemilik, yang membaca catatan Anda di Antrean Konsolidasi, memperbaikinya (atau mengembalikannya ke Requestor), lalu mengirimnya lagi.

Bila Finance meminta klarifikasi, baris kembali ke RKA Divisi dengan catatan Finance. Jawab di Diskusi atau selesaikan dengan departemen, lalu setujui lagi. Division Owner juga dapat membuka Management Summary untuk angka divisinya.

## Finance: review, finalisasi dan kunci

Finance Reviewer memeriksa RKA semua divisi, meminta klarifikasi atau memfinalisasi, lalu mengunci versi final. Finance juga menjalankan siklus, merawat COA Master, mengisi Realisasi tahun lalu dan menentukan pembagian biaya bersama.

### Status Board Finance

Di atas, *Posisi RKA per divisi* berupa tabel dengan jumlah baris per tahap untuk setiap divisi, total baris dan porsi yang sudah final. Di bawahnya antrean baris di Review Finance.

1. Periksa konsistensi; Finance masih boleh mengoreksi nominal baris di Review Finance.
2. Centang baris lalu pilih *Minta klarifikasi* (kembali ke Persetujuan Divisi, catatan wajib) atau *Finalisasi* (pindah ke Menunggu Kunci). *Finalisasi* meminta konfirmasi yang menyebut jumlah baris, divisi dan totalnya; pilih *Ya, Finalisasi* atau *Batal*.

Angka di tabel *Posisi RKA per divisi* dapat diklik untuk membuka baris di divisi dan tahap itu.

Di setiap antrean persetujuan, subtotal per unit memisahkan Pendapatan, Biaya dan CAPEX.

### Daftar Baris RKA

Semua baris RKA, 50 per halaman. *Cari baris* mencari kode COA, nama COA atau uraian, dan *Tahap* menyaring menurut tahap persetujuan. Tiap baris menampilkan kode COA dan uraiannya, dengan *Total RKA* sebelum Januari; judul kolom dan baris total tetap terlihat saat digulir. Total dipisah menjadi *Total Pendapatan*, *Total Biaya* (COGS, OPEX, OTHERS) dan *Total CAPEX*; pendapatan tidak pernah dijumlahkan dengan biaya. Nol ditulis sebagai garis, dan satuan ada di judul kolom COA.

### Kunci RKA

Daftar baris yang sudah difinalisasi. *Kunci versi* menguncinya, setelah Anda mengonfirmasi dengan *Ya, Kunci versi*: versi tidak dapat diubah lagi dan diskusinya ditutup. Semua peserta siklus menerima satu email. Direktur dapat membuka layar ini untuk membaca, tetapi penguncian adalah tugas Finance.

### Siklus RKA

- *Buka siklus baru* membuka tahun anggaran berikutnya, kosong atau dari RKA tahun lalu yang terkunci (lihat Persiapan siklus).
- *Ubah batas waktu* menggeser Batas pengajuan versi yang terbuka.
- Tabel versi menampilkan setiap versi, statusnya dan *Revisi dari* bila disalin dari versi lain. Lihat juga bagian revisi.

### Realisasi

Layar Realisasi punya dua bagian.

**Realisasi dari pembayaran** terisi sendiri dari Permintaan Pembayaran untuk tahun anggaran yang dipilih di Tampilan: per baris RKA, Rencana, Realisasi (DPP permintaan yang Paid), Sedang berjalan (sudah disetujui atasan, belum dibayar), Sisa dan Serapan. Hanya baris yang punya permintaan yang tampil; Sisa merah bila baris itu terlampaui. Selama RKA belum dikunci, angka rencananya masih bisa berubah. Halaman baris RKA juga menampilkan ringkasan ini beserta daftar permintaannya.

**Actual tahun lalu**: Finance mengetik atau menempel realisasi tahun lalu di setiap baris tahun yang dipilih (misalnya Actual 2026 untuk RKA 2027). Judul layar dan kolomnya mengikuti tahun anggaran di kepala halaman.

1. Cari dengan *Cari COA atau uraian*.
2. Ketik nominal di kolom Actual, atau tempel satu kolom dari Excel; nilainya mengisi baris ke bawah. Sel kosong menghapus realisasi.
3. Baris yang berubah diberi warna; *Simpan (N)* menyimpan hanya baris itu, masing-masing tercatat di jejak audit.

Realisasi berdiri di samping rencana dan tidak mengubahnya, jadi dapat diisi di tahap mana pun, termasuk setelah dikunci.

### Biaya Bersama

Finance menandai baris biaya yang melayani semua entitas dan memilih cara membaginya ke ESTRADA, MATRIK, DJALU dan PAS. Barisnya tidak berubah; hanya laporan yang membaginya.

1. Di *Dasar pembagian per entitas*, periksa porsi pendapatan (dari baris pendapatan versi ini) dan isi headcount per entitas, lalu *Simpan headcount*.
2. Di *Baris biaya*, cari baris lalu pilih Dasar alokasi: *Porsi pendapatan*, *Headcount*, *Persentase tetap* (isi persen per entitas, harus berjumlah 100) atau *Bukan biaya bersama*.
3. *Simpan (N)* menyimpan baris yang berubah. *Hanya biaya bersama* menampilkan baris biaya bersama saja.

Management Summary dan unduhan Excel lalu menampilkan biaya sendiri, alokasi biaya bersama dan total setelah alokasi per entitas. Total perusahaan tidak berubah. Baris yang sudah dikunci mempertahankan pembagiannya; revisi menyalin dasar dan headcount-nya.

### COA Master

- *Daftar COA* tampil sebagai pohon per kategori: Revenue, COGS, OPEX, OTHERS, CAPEX, lalu Pajak dan Neraca (aset, kewajiban dan ekuitas). Pajak dan Neraca ada di COA Master tetapi tidak muncul di pilihan COA baris RKA. Kode induk punya panah untuk membuka atau menutup cabangnya; *Buka semua* dan *Tutup semua* membuka atau menutup semua cabang; *Cari kode atau nama* menemukan kode dan tetap menampilkan induknya.
- *Tambah atau ubah COA*: kode, nama, kategori, default owner, induk dan status. Induk harus berkategori sama dan tidak boleh membentuk lingkaran; pengecualiannya aset tetap (CAPEX) yang boleh berada di bawah atau di atas akun Neraca, misalnya 1500 Aset Tetap di bawah 1000.
- *Kode sementara dari workbook*: kode yang dipakai baris tetapi belum ada di COA Master. *Konfirmasi* menjadikannya akun tetap, atau pindahkan barisnya ke kode lain dengan kategori yang sama.
- Kode Nonaktif tidak bisa dipakai baris baru; baris lama tetap memakainya.

## Direktur dan Auditor

**Direktur** membaca Management Summary, Pipeline dan Arus Kas, melihat Kunci RKA dan Siklus RKA, berkomentar di baris mana pun dan membaca jejak audit. Penguncian adalah tugas Finance.

**Auditor** membaca semuanya dan tidak mengubah apa pun: Management Summary, Pipeline, Arus Kas, setiap baris beserta Riwayat dan Diskusinya. Auditor dapat membaca diskusi tetapi tidak ikut berkomentar.

## Admin

Admin mengelola orang dan data master, tidak pernah isi anggaran; baris anggaran tidak tampil untuk Admin.

- **Pengguna**: undang pengguna dan lihat statusnya. Buka pengguna (*Edit pengguna*) untuk mengubah nama atau email dan melihat posisi yang dipegangnya; akses selalu mengikuti posisi.
- **Unit & Entitas**: unit organisasi (kode, nama, jenis dan induk) dan entitas (ESTRADA, MATRIK, DJALU, PAS, masing-masing biaya langsung atau tidak langsung). Posisi, baris dan laporan memakai daftar ini. Kode tidak bisa diubah setelah dibuat.
- **Struktur Organisasi**: tempat menyusun posisi dan menetapkan orangnya. Unit dan induknya diatur di Unit & Entitas; pengguna diundang di Pengguna.
  - *Bagan* menampilkan perusahaan di atas, unit staf yang langsung di bawah Direktur (misalnya Strategic Growth & Ventures) pada garis tengah, lalu divisi berjajar dan departemen di bawah setiap divisi. Setiap kartu unit memuat posisinya: nama pemegang, *pjs …* bila diisi pejabat sementara, atau *Kosong* berwarna kuning. Lencana *N kosong* menghitung posisi kosong di unit itu dan di bawahnya.
  - Klik orang atau posisi untuk membuka *Edit posisi* dan menetapkan pemegang, entitas atau pjs. *Tambah posisi* di kartu unit membuka *Buat posisi* dengan unit itu terisi.
  - *Daftar* menampilkan semua posisi dalam tabel, formulir *Buat posisi*, dan pjs untuk kursi yang kosong.
  - Bagan mengikuti dokumen *Struktur Organisasi* klien: divisi, departemen, dan bagiannya (misalnya Account Mgmt, PreSales, Sales Ops) yang tampil di dalam kartu departemen. Tim teknis memuat dokumen itu dengan \`pnpm db:struktur\`; nama orang di dalamnya tidak disimpan di GitHub.
  - Nama dari dokumen yang belum punya akun tampil dengan ikon orang bertanda plus (arahkan kursor untuk keterangannya) dan tidak dihitung kosong. Setelah orangnya diundang di Pengguna, buka posisinya dan pilih akunnya di *Pemegang*; nama dari dokumen lalu diganti nama akun. Kolom *Nama di struktur* di *Edit posisi* dapat dipakai untuk mengubah nama itu.
- **RKA tertahan karena posisi kosong**: kursi yang ditunggu baris tetapi tidak ada pemegangnya. Tetapkan pemegang atau pjs untuk melepaskannya. Saat baris diserahkan ke kursi kosong, Admin menerima email.
- **Bertindak sebagai** (menu akun): Admin dapat bertindak sebagai kursi mana pun, dikelompokkan per peran (ketik awal jabatan untuk melompat). Selama aktif, kepala halaman (di ponsel: baris tersendiri di bawahnya) menulis *Melihat sebagai …* dengan tombol *Kembali*. Admin memakainya untuk melihat aplikasi persis seperti peran itu, misalnya untuk memeriksa laporan masalah. Setiap pergantian tercatat di jejak audit; *Admin (saya sendiri)* kembali.

## Management Summary

Ringkasan RKA untuk Division Owner, Finance Reviewer, Direktur dan Auditor.

- **Belum ada data**: bila RKA belum memuat baris pendapatan, kartu Pendapatan menulis *Belum ada data* dan Laba Sebelum Pajak hanya berisi biaya. Di ponsel, tabel tampil lebih dulu daripada grafik.
- **Filter**: Entitas, Divisi dan Satuan dari Tampilan di kepala halaman di kepala halaman; Versi dan Status di bilah atas layar ini. *Unduh Excel* di kanan atas mengunduh versi itu sebagai workbook dengan susunan RKA Data, Rekap, Kontribusi Divisi dan Per Entitas.
- **Peringatan belum final**: bila angka memuat baris yang belum difinalisasi, jumlahnya disebut di atas kartu.
- **Empat kartu**: Pendapatan, Total Biaya, Laba Sebelum Pajak dan CAPEX, masing-masing dengan garis tren 12 bulan. Lencana perubahan terhadap tahun lalu muncul bila cukup baris punya angka RKA tahun lalu, dan dibandingkan atas baris yang sama. Di bawah kartu, satu kalimat menunjukkan hitungannya: Laba Sebelum Pajak = Pendapatan − (Total Biaya − CAPEX).
- **Grafik**: pendapatan dan total biaya per bulan (batang) dengan laba sebelum pajak (garis), serta kontribusi per divisi.
- Di tabel per bulan, kolom *Total* berada di samping uraian, sebelum Januari (juga di Arus Kas).
- Tabel rinci ada di tab **Per bulan**, **Per divisi** dan **Per entitas** (tombol panah kiri dan kanan memindah tab). Per entitas menampilkan alokasi biaya bersama bila ada.
- Pipeline tertimbang tampil sebagai satu baris terpisah di bawah kartu, di luar RKA.

## Persetujuan perubahan master

Perubahan **COA** dan **Perusahaan** (entitas) tidak langsung berlaku. Setiap perubahan menjadi permintaan yang disetujui **Finance Controller**, yaitu Division Owner FRM.

| Langkah | Siapa | Yang terjadi |
| --- | --- | --- |
| Ajukan | Finance Reviewer (COA, di *COA Master*) atau Admin (Perusahaan, di *Unit & Entitas*) | Isi perubahan, *Alasan perubahan* dan *Tanggal berlaku* (hari ini atau sesudahnya), lalu kirim. Data master belum berubah; Finance Controller menerima email |
| Setujui atau tolak | Division Owner FRM, di *Persetujuan Master* | Menolak wajib disertai catatan. Pemohon tidak dapat memutuskan permintaannya sendiri. Pemohon menerima email keputusan |
| Terapkan | Aplikasi | Bila tanggal berlaku sudah tiba, perubahan diterapkan saat disetujui. Bila belum, diterapkan oleh jadwal harian pada tanggal itu |

- **Status**: Menunggu persetujuan, Disetujui menunggu tanggal berlaku, Diterapkan, Ditolak, Dibatalkan, atau Gagal diterapkan (data master sudah berubah sehingga permintaan tidak lagi bisa dilakukan; ajukan ulang).
- **Batalkan**: hanya pemohon, selama permintaan belum diterapkan.
- **Satu permintaan terbuka** per kode COA atau entitas.
- *Persetujuan Master* dapat dibaca Division Owner FRM, Finance Reviewer, Direktur, Auditor dan Admin. Setiap langkah dan nilai sebelum dan sesudah tercatat di jejak audit.
- **Tidak ada hapus**: kode sementara yang barisnya dipindahkan dinonaktifkan, tidak dihapus.

## Data perusahaan

Di *Unit & Entitas*, tiap entitas punya bagian *Data perusahaan*: NPWP, NIB, modal dasar, kedudukan, alamat, telepon, email, direktur dan komisaris (dari sheet M Perusahaan). Perubahannya mengikuti persetujuan yang sama seperti di atas: isi, tulis alasan dan tanggal berlaku, lalu *Ajukan*.

## Cost center dan level organisasi

Cost center adalah unit organisasi. Di *Master Data*, tab **Cost Center** menampilkan *Function group* (Revenue, Delivery, Support, Governance) dan *Limit persetujuan* tiap unit. Finance Reviewer dan Admin mengubahnya lewat *Ubah*; Direktur dan Auditor hanya membaca. Nilai awal berasal dari sheet 33_Master_CostCenter, dan kode CC lamanya tercatat sebagai nama lain unit. CC-008 IT & Infrastructure tidak punya unit.

*Limit persetujuan* dipakai Permintaan Pembayaran: nominal di atas limit menambah persetujuan Head FRM dan Direktur. Limit yang kosong berarti tanpa batas tambahan.

Di *Struktur Organisasi*, Admin mengisi *Level organisasi* (1 sampai 4) dan *Kode fungsi* (F0 sampai F6) pada halaman edit posisi. Aplikasi hanya mengisi sendiri posisi yang jelas cocok dengan sheet M Organisasi dan 07_Org_Chart.

## Periode bulanan

Di *Master Data*, tab **Periode** menampilkan status tiap bulan per PT: **Terbuka**, **Penutupan** atau **Ditutup**.

| Langkah | Siapa | Akibat |
| --- | --- | --- |
| Mulai penutupan, Batalkan penutupan | Finance Reviewer atau Division Owner FRM | Selama Penutupan, pembayaran masih dapat dicatat dengan peringatan |
| Tutup | Finance Reviewer atau Division Owner FRM | Tanggal jadwal bayar dan tanggal bayar di bulan itu ditolak untuk PT tersebut |
| Buka kembali | Admin atau Division Owner FRM | Wajib alasan; bulan kembali Terbuka |

Setiap langkah tercatat di jejak audit. Finance Reviewer, Direktur, Auditor, Admin dan Division Owner FRM dapat membuka tab ini. Rencana (pinjaman di *Arus Kas*, termin di *Pipeline*) tidak dikunci.

Menutup bulan membutuhkan total neraca yang seimbang dan menyimpan snapshot laba rugi (lihat **Tutup Buku**).

## Pemisahan tugas (SoD)

Aplikasi menolak langkah yang menurut matriks SoD (sheet 05_SoD_Matrix) tidak boleh dilakukan orang yang sama atas satu data, walaupun ia memegang dua posisi atau berpindah lewat *Bertindak sebagai*. Berlaku pada baris RKA dan Permintaan Pembayaran. Mengembalikan atau meminta klarifikasi tidak dibatasi.

Pasangan yang wajib dipisah: Head BusDev dan Sales; PM dan SCM; PM atau SCM dengan Cash Management atau AR/Tax; antara Pricing, Cash Management, AR/Tax dan Accounting; serta Audit dengan Data Steward. Contoh: orang yang sudah memeriksa pembayaran sebagai Business Finance tidak dapat menjadwalkan atau membayarnya sebagai Cash Management.

## Audit Log

Menu **Audit Log** dibuka Auditor, Direktur dan Admin. Setiap baris menunjukkan waktu (WIB), user dan alamat IP, kode kejadian dengan modul dan tingkatnya, objek, serta nilai sebelum dan sesudah (*Lihat*). Masuk, keluar dan percobaan masuk yang gagal ikut tercatat; kata sandi tidak pernah disimpan.

- **Filter**: user, modul, kode kejadian, objek (jenis atau ID) dan rentang tanggal, lalu *Terapkan*.
- **Unduh CSV** mengunduh hasil filter, paling banyak 10.000 baris terbaru.
- **Katalog kode kejadian** di bawah tabel memuat tingkat dan masa simpan tiap kode (sheet 04_Audit_Log_Spec); kode bertanda *Tambahan aplikasi* tidak ada di sheet itu. Aplikasi belum menghapus baris yang melewati masa simpan.

## Kepatuhan

Menu **Admin → Kepatuhan** memuat 17 regulasi dan standar dari sheet 06_Compliance: pasal, area modul, penerapan di ERP dan bukti yang diharapkan. Head Finance & Risk Management dan Auditor memperbarui **status** (Belum diterapkan, Sedang diterapkan, Sudah diterapkan, Rencana mendatang), **tautan bukti** (alamat web) dan catatan; Finance Reviewer, Direktur dan Admin membaca. Setiap perubahan tercatat di Audit Log.

## Kartu di Beranda

Di bawah antrean dan progres RKA, Beranda menampilkan kartu sesuai peran. Angka mengikuti *Entitas* dan *Satuan* di kepala halaman, dan *Rincian* membuka layar asalnya bila ada di menu Anda.

| Kartu | Isi | Dilihat oleh |
| --- | --- | --- |
| RKA per divisi | Anggaran biaya, realisasi dan komitmen pembayaran, sisa, persen terpakai | Direktur, Auditor, Finance Reviewer, Division Owner (divisinya) |
| Cost center | Anggaran, realisasi, run rate per unit; tanda bila run rate berbeda lebih dari 10% dari anggaran | Finance Reviewer, Default Owner dan Division Owner (unitnya) |
| Arus kas | Proyeksi masuk, keluar, saldo per bulan, dan runway | Direktur, Auditor, Finance Reviewer, Cash Management, Division Owner FRM |
| Obligo bank | Plafon, outstanding, sisa per fasilitas; peringatan bila satu fasilitas di atas 50% plafon | Sama dengan Arus kas |
| Pipeline | Jumlah deal, nilai, tertimbang dan umur per status | Direktur, Auditor, orang BCD |
| Headcount | Karyawan aktif dan rencana posisi RKA per unit, tanpa gaji | Direktur, Auditor, Division Owner (divisinya), HCM |
| Proyek | Status dan nilai kontrak | Direktur, Auditor, orang BCD dan PDMS |

Anggaran diambil dari versi RKA yang terkunci; selama belum ada, dari versi yang berjalan dan diberi tanda *belum dikunci*. Division Owner FRM bertindak sebagai CFO dan melihat angka seluruh perusahaan.

## Monitor Anggaran

Menu **Monitor Anggaran** menampilkan anggaran biaya terhadap pembayaran per cost center (unit pemilik); klik nama unit untuk melihat per COA. Finance Reviewer, Direktur, Auditor dan Division Owner FRM (CFO) melihat seluruh perusahaan; Default Owner dan Division Owner melihat unitnya.

Pilih **Per tanggal** dan **Periode** (bulan berjalan, kuartal berjalan, atau tahun berjalan) lalu *Terapkan*.

| Kolom | Arti |
| --- | --- |
| Anggaran setahun | Baris biaya RKA yang terkunci; selama belum ada, versi yang berjalan dan diberi tanda *belum dikunci* |
| Anggaran periode | Rencana bulanan periode itu sampai tanggal yang dipilih; bulan berjalan dihitung menurut harinya |
| Realisasi periode | Pembayaran berstatus Paid dalam periode |
| Penyesuaian | Akrual dan koreksi dalam periode, dicatat Accounting |
| Komitmen | Permintaan Pembayaran dari Submitted sampai Scheduled, keadaan sekarang |
| Sisa | Anggaran setahun dikurangi realisasi, penyesuaian sejak awal tahun, dan komitmen |
| Terpakai | Bagian anggaran setahun yang sudah terpakai |
| Selisih periode | Realisasi dan penyesuaian dikurangi anggaran periode |
| Perkiraan akhir tahun | Realisasi sejak awal tahun dengan laju sejauh ini |
| Status | **Aman** di bawah 80%, **Waspada** 80 sampai 95%, **Melebihi** di atas 95% |

Lima kartu di atas tabel meringkas anggaran, realisasi periode, komitmen, sisa dan persen terpakai.

### Penyesuaian manual

Staf dan kepala Accounting (unit FRM-FIN-ATM) mencatat akrual atau koreksi di bagian bawah layar: tanggal (di dalam tahun anggaran dan tidak sesudah hari ini), entitas, cost center, COA, jenis, nominal (negatif untuk mengurangi) dan alasan. Bulan yang sudah ditutup menolak penyesuaian. Penyesuaian tidak diubah atau dihapus; koreksi dengan entri berlawanan. Pembayaran sudah masuk otomatis dan tidak diisi ulang.

## Analisis Varians

Menu **Analisis Varians** (juga dari Monitor Anggaran) membandingkan realisasi (termasuk penyesuaian) dengan anggaran periode per cost center, dengan pilihan tanggal dan periode yang sama, dan per COA, dengan satu kalimat otomatis tiap baris (sheet 37_Variance_Analysis).

| Tingkat | Selisih, naik atau turun |
| --- | --- |
| Wajar | di bawah 5% |
| Watch | mulai 5% |
| Investigate | mulai 10% |
| Escalate | mulai 15% |

- **Catatan penyebab** ditulis pemilik cost center, yaitu Default Owner atau Division Owner unit tersebut atau di atasnya, minimal 10 karakter. Baris Escalate wajib punya catatan; yang belum punya dihitung di atas daftar dan dapat disaring lewat *Belum ada catatan*. Catatan tidak diubah atau dihapus: tulis catatan baru, riwayatnya tetap tampil.
- Pada tanggal sebelum tahun anggaran belum ada varians.

## Invoice

Menu **Invoice** menagih satu billing termin per invoice. Termin yang bisa ditagih berasal dari deal yang sudah punya proyek (kartu **Termin siap ditagih**) dan terhubung ke Master Customer.

| Langkah | Siapa | Keterangan |
| --- | --- | --- |
| Buat invoice (Draft) | Staf atau kepala Accounting (unit FRM-FIN-ATM) | Isi uraian, tanggal (tidak sesudah hari ini), rekening, penalti, denda dan PPh. Accounting lain menerima email |
| Validasi pajak | Orang Accounting lain | Draft dapat disunting dulu; pembuat tidak dapat memvalidasi |
| Setujui, lalu Terbitkan | Division Owner FRM | Bukan pembuat dan bukan validator. Terbit memberi nomor **INV/PT/YY/NNNN**; bulan yang sudah ditutup ditolak; rekening wajib terisi |
| Kembalikan | Division Owner FRM | Wajib alasan; kembali ke Draft |
| Batalkan | Accounting | Hanya Draft atau Pajak tervalidasi, wajib alasan; termin dapat ditagih lagi |

- **Hitungan**: DPP = tagihan termin − penalti − denda; PPN 11% dari DPP; nilai invoice = DPP + PPN; PPh dihitung dari DPP (PPh 23 otomatis 2%, PPh 4(2) dan 22 diisi tarifnya). Diperkirakan diterima = nilai invoice − PPh, dan untuk customer **Wapu** juga dikurangi PPN: PPN tetap tertulis tetapi dipungut customer.
- **Jatuh tempo** = tanggal invoice + term of payment customer di Master Customer, 30 hari bila kosong.
- **Termin yang sudah ditagih** tidak dapat dihapus atau diubah nilainya di Pipeline.
- Finance Reviewer, BFP, Cash Management, Direktur dan Auditor dapat membaca.

### Pemicu penagihan (RFS dan BAST)

- Proyek **layanan** (model bisnis deal **Recurring**) tidak bisa menerbitkan invoice apa pun, termasuk DP, sebelum **RFS** disahkan. Draft boleh disiapkan; daftar termin menandai *Menunggu RFS*. Model Project, Trading atau yang belum diisi tidak ditahan.
- Saat Head PMO mengesahkan **RFS** atau **BAST**, Accounting mendapat email berisi termin berikutnya yang siap dibuatkan invoice.

## Penerimaan dan Piutang

- **Catat penerimaan** (Cash Management) di halaman invoice yang sudah terbit: tanggal terima (antara tanggal invoice dan hari ini, di bulan yang terbuka), nilai bayar, rekening penerima dan referensi mutasi bank. Total penerimaan tidak boleh melebihi nilai invoice. Penerima tidak boleh pembuat, validator atau penyetuju invoice itu.
- **Sisa** = nilai yang diperkirakan diterima dikurangi penerimaan. Penerimaan yang salah dibatalkan dengan alasan; barisnya tetap tampil.
- Menu **Piutang** menampilkan **Tinjauan mingguan** (lewat jatuh tempo atau jatuh tempo dalam 7 hari), **Umur piutang per customer** (belum jatuh tempo, 1–30, 31–60, 61–90, di atas 90 hari) dan **Proyeksi cash-in 12 bulan** dari invoice terbuka dan termin yang belum ditagih.

## Tagihan vendor dan Hutang

Permintaan jenis *Pembayaran* yang memilih **Mitra** adalah tagihan vendor: isi **Nomor invoice vendor**, **Tanggal invoice vendor** dan, bila ada, **Proyek**. Nomor dan tanggal wajib sebelum dikirim, dan nomor yang sama dari mitra yang sama ditolak.

- **PPh** dihitung dari *Jenis PPh* dan *Tarif* atas Nominal (DPP): PPh 23 otomatis 2%, PPh 4(2) dan 22 diisi tarifnya. Permintaan lama yang nominal PPh-nya diketik tetap memakai angka itu.
- Menu **Hutang** (Finance Reviewer, BFP, Cash Management, Direktur, Auditor) menampilkan tagihan mitra dari *Submitted* sampai *Scheduled*: yang jatuh tempo minggu ini dan umur hutang per mitra, nilai nett.

## Skenario

Menu **Kas → Skenario** memproyeksikan tahun berjalan dalam tiga skenario: **Conservative**, **Normal** dan **Aggressive**. Finance Reviewer mengisi; Direktur dan Auditor membaca.

- Asumsi per skenario: target pendapatan, COGS % dan OpEx % dari pendapatan, tarif pajak, DSO, DPO dan CapEx; satu **persentase pendapatan per bulan** (jumlah 100). Nilai awal dari sheet 22_Assumptions sampai disimpan. *Isi Normal dari RKA* mengambil total dan rasio RKA, bila RKA punya pendapatan.
- Proyeksi kas memakai aturan **Arus Kas**: DSO dan DPO dibulatkan ke bulan sebagai jeda penagihan dan pembayaran; saldo awal, pinjaman dan saldo minimum dari Arus Kas; penyusutan CapEx/12 mengurangi laba, bukan kas.
- **Burn rate** = rata-rata kas keluar 3 bulan; **runway** = saldo akhir dibagi burn rate.
- **Sensitivitas** menunjukkan laba bersih untuk kombinasi COGS % dan OpEx % di sekitar skenario terpilih (tanpa penyusutan dan bunga).

## Kas Mingguan

Menu **Kas → Kas Mingguan** menampilkan realisasi kas per minggu: **W1** tanggal 1–7, **W2** 8–14, **W3** 15–21, **W4** 22 sampai akhir bulan. Dibaca oleh Cash Management, Finance, Division Owner FRM, Direktur dan Auditor.

- Pilih **Bulan**, lalu **Tampilkan**. Filter Entitas di header memilih satu PT; tanpa filter, angka adalah konsolidasi semua PT aktif dan tabel **Per entitas** menunjukkan penyusunnya.
- **Saldo kas awal** berasal dari saldo 1 Januari di **Arus Kas → Asumsi** ditambah semua mutasi sebelumnya. PT yang saldonya belum diisi dihitung nol dan diberi peringatan.
- **Cash In** otomatis dari penerimaan invoice. *Indirect* bila pelanggannya perusahaan Telkom dan pelanggan akhir pada deal berbeda; selain itu *Direct*.
- **Kas keluar** otomatis dari Permintaan Pembayaran yang sudah **dibayar**, sebesar nilai nett, pada tanggal bayar. Akunnya mengikuti baris anggaran: **Direct Cost** (COA 5100–5900), **OPEX** (COA 6100–6420), selain itu **Pengeluaran lain**.
- **Pinjaman, bunga dan cicilan** otomatis dari **Obligo Bank**: penarikan kredit pada tanggal terbitnya, pokok dan bunga pada tanggal bayarnya.
- **Cash Management** mencatat sisanya di **Transaksi kas lain**: penerimaan lain, biaya di luar Permintaan Pembayaran (wajib memilih akun COA) dan pengeluaran lain. Jangan catat ulang yang sudah ada di aplikasi.
- Tanggal transaksi harus pada periode yang belum ditutup dan tidak setelah hari ini. Transaksi yang salah **dibatalkan** dengan alasan, tidak dihapus.

## Obligo Bank

Menu **Kas → Obligo Bank** memuat fasilitas bank yang dipakai: plafon, outstanding dan kelonggaran. Dibaca Cash Management, Finance, Division Owner FRM, Direktur, Auditor dan orang PMO. Peringatan muncul bila satu bank memegang lebih dari 50% seluruh plafon.

- **Fasilitas** dikelola Cash Management (*Kelola fasilitas*): bank, nama, jenis (Bank Garansi, KMK, Kredit Investasi, Trade Line), perusahaan, plafon, expired, tanggal bunga dan rekening escrow. Plafon tidak boleh di bawah outstanding.
- **Permintaan** penarikan kredit atau Bank Garansi diajukan orang PMO atau Finance: pilih fasilitas, nilai, underlying (kontrak atau KL) dan lampirkan dokumennya. Bank Garansi wajib terkait proyek dan memilih tipe (Penawaran, Pelaksanaan, Pemeliharaan, Uang Muka). Melebihi kelonggaran, atau fasilitas expired, ditolak.
- **Cash Management** memeriksa lalu *Terbitkan* (nomor BG atau akad, tanggal terbit, jatuh tempo) atau *Tolak* dengan alasan. Pengaju tidak bisa menerbitkan permintaannya sendiri.
- **Release BG:** PM proyek (Head PMO bila proyek belum punya PM) menekan *Konfirmasi kontrak selesai*, lalu Cash Management *Lepas BG*. BG yang lewat jatuh tempo berstatus Expired dan tetap memakai plafon sampai dilepas.
- **Pokok dan bunga** dicatat Cash Management; pokok mengurangi outstanding penarikannya. Yang salah dibatalkan dengan alasan.
- **Pengingat email** ke Cash Management: 30 hari sebelum plafon atau BG expired, dan 7 hari sebelum tanggal bunga.
- Data awal berasal dari sheet 14_Obligo_Status_Apr2026 (per 14 April 2026, ditandai *Saldo awal*, tidak masuk Kas Mingguan). Tanggal expired plafon diisi Cash Management.
- Pinjaman di **Arus Kas** adalah rencana tahunan dan terpisah dari daftar ini.

## Pajak

Menu **Penagihan → Pajak** merangkum PPN dan PPh per masa (bulan). Accounting & Tax (FRM-FIN-ATM) mencatat; Finance, Division Owner FRM, Direktur dan Auditor membaca.

- Daftarnya otomatis: **Faktur Pajak Keluaran** dari invoice terbit ber-PPN; **Faktur Pajak Masukan** dari Permintaan Pembayaran ber-PPN yang sudah dikirim; **Bukti Potong PPh** dari permintaan yang memotong PPh.
- Accounting menekan *Catat* pada barisnya: nomor, tanggal dan status (Dicatat, Diunggah, Disetujui DJP, Ditolak DJP). Dokumen masuk ke masa menurut tanggal dokumen pajaknya; yang belum dicatat menurut tanggal invoice, tagihan atau bayarnya.
- **Perlu tindakan:** lewat 7 hari, faktur keluaran dan bukti potong yang belum diunggah, serta faktur masukan yang belum dicatat. Hanya peringatan; penerbitan invoice dan pembayaran tidak diblokir.
- **Ringkasan masa:** PPN kurang bayar = PPN keluaran dikurangi PPN masukan yang fakturnya sudah dicatat. PPN Wapu dipungut pembeli dan ditampilkan terpisah. PPh harus disetor = potongan atas vendor ditambah PPh 21.
- **PPh 21** diketik Accounting per perusahaan per bulan (aplikasi belum memuat penggajian), pada periode yang belum ditutup.
- **Unduh Excel** memberi tiga lembar (PPN Keluaran, PPN Masukan, Bukti Potong). Ini bukan format unggah DJP; format Coretax menyusul setelah templat resminya tersedia.

## Tutup Buku

Menu **Kinerja → Tutup Buku** menyiapkan dan menyimpan angka akhir bulan per PT. Dibaca Accounting, Finance, Division Owner FRM, Direktur dan Auditor.

1. **Accounting & Tax** mengisi total neraca bulan itu: aset lancar, total aset, liabilitas jangka pendek, total liabilitas dan ekuitas (boleh negatif).
2. Periksa **laba rugi** berjalan: pendapatan dari invoice terbit (DPP) pada bulan itu; biaya dari Permintaan Pembayaran yang **dibayar** pada bulan itu, akrual dan koreksi, biaya di Kas Mingguan; serta bunga pinjaman. Belanja modal (CAPEX) dan akun neraca tidak masuk.
3. **Finance Reviewer atau Division Owner FRM** menutup bulan di *Periode* (Master Data). Penutupan ditolak bila neraca belum diisi atau aset tidak sama dengan liabilitas ditambah ekuitas.
4. Saat ditutup, laba rugi dan neraca disimpan sebagai **snapshot** yang tidak bisa diubah. Bila periode dibuka kembali lalu ditutup lagi, terbentuk versi baru; versi lama tetap bisa dibuka dari *Riwayat snapshot*.

## Laba Rugi

Menu **Kinerja → Laba Rugi** menyusun realisasi dari Pendapatan sampai Laba Bersih dan membandingkannya dengan RKA. Dibaca Accounting, Finance, Division Owner FRM, Direktur dan Auditor.

- Bila periode itu belum punya realisasi, kartu di atas menulis *Belum ada data*, bukan nol.
- Pilih **Bulan** dan **Periode** (bulan berjalan, kuartal berjalan atau tahun berjalan sampai bulan itu). Bulan yang sudah ditutup memakai snapshot **Tutup Buku**; bulan yang belum ditutup dihitung dari pembukuan saat ini.
- Urutan: Pendapatan, Beban Pokok, Laba Kotor, Beban Operasional, EBITDA, Penyusutan dan amortisasi (COA 58xx dan 629x), EBIT, pendapatan lain (71xx), beban bunga (722x–723x), beban lain, Laba sebelum pajak, Pajak, Laba bersih. Rincian per akun dibuka pada barisnya.
- Kolom **RKA** memakai versi terkunci tahun itu (atau versi berjalan) untuk bulan dan PT yang sama; CAPEX tidak masuk laba rugi.
- Tanpa filter Entitas, angka adalah **konsolidasi**: penjualan dan biaya antar perusahaan grup **dieliminasi**. Centang *Sebelum eliminasi* untuk melihat angka mentah. Tabel antar perusahaan menunjukkan pasangan yang belum cocok.
- Perusahaan grup dikenali dari isian **Perusahaan grup** pada Master Customer dan Master Mitra.
- Invoice baru wajib memilih **Akun pendapatan** (COA 4xxx). Invoice lama tampil sebagai *Pendapatan (tanpa akun)*.
- **Unduh Excel** mengunduh laporan yang sama beserta rincian akunnya.

## Pengadaan

Menu **Proyek → Pengadaan** dari kebutuhan proyek sampai penerimaan barang.

1. **PM proyek atau PMO** mengajukan permintaan: proyek, baris RKA, spesifikasi dan perkiraan nilai (nomor PR/PT/YY/NNNN).
2. **BFP atau Finance Reviewer** memeriksa budget: setujui atau tolak dengan alasan.
3. **SCM** membuat **PO** atas permintaan yang disetujui: mitra, produk, kuantitas, harga satuan (nomor NNN/PT-PO/MM/YYYY). Total PO tidak boleh melebihi permintaannya; mitra tanpa NPWP diberi peringatan.
4. **Head SCM** menyetujui (Head PDMS bila Head SCM yang membuat). Di atas *Limit persetujuan* unit peminta, dilanjutkan **Head FRM** lalu **Direktur**. Pembuat dan peminta tidak bisa menyetujui.
5. **PM atau PMO** mencatat **BAST** penerimaan (bisa bertahap), tidak melebihi nilai PO.
6. Pada **Permintaan Pembayaran** ke mitra, pilih *Purchase order*; baris RKA mengikuti permintaannya. **BFP** tidak bisa meneruskan tagihan bila total tagihan PO melebihi nilai yang sudah diterima. Tagihan tanpa PO tetap boleh.

PO yang disetujui dan belum ditagih dihitung sebagai **komitmen** pada sisa anggaran baris RKA dan Monitor Anggaran; Realisasi tetap tercatat saat dibayar.

## Tracker Telkom

Menu **Penagihan → Tracker Telkom** mengikuti proyek **skema TELKOM** (ditandai di halaman proyek) dari tender sampai uang masuk.

- **Sales (BCD)** menekan *Mulai pelacakan*; SLA tahap pertama dihitung dari tanggal itu.
- Dua belas tahap berurutan: P6, P8, Kontrak Layanan, BAI, BAUT/BARD, BAST, Close WFM PSB, Close WFM Existing, BAK/BAPL, BA Kesepakatan, OGP/SPB, Cash In. Tiap tahap diisi unit penanggung jawabnya (Sales, Legal, PM/OPS, Finance AR, Cash Management) dengan **tanggal dan dokumen bukti**. Close WFM PSB, Close WFM Existing dan BA Kesepakatan boleh ditandai **Tidak berlaku** dengan alasan. Tahap terakhir bisa dibatalkan dengan alasan.
- **Eskalasi** otomatis tiap hari: lewat batas SLA menjadi tier 1, naik satu tier tiap satu periode SLA lagi sampai tier 5. Email tier 1–3 ke orang unit penanggung jawab, tier 4 ke head-nya, tier 5 ke Direktur. Tahap tanpa durasi SLA tidak dieskalasi.
- **Kendala** (kontrak, BAST, BAPL) dengan penyebab dan perkembangan dicatat tim delivery atau pemilik tahapnya.
- **Assurance JPMB** tujuh area (OBL Govsol, OBL PSS, Legal, GSPO, ASC, PIA, Finance) diisi tim delivery per proyek dan diringkas untuk semua proyek.

## Target KPI

Menu **Kinerja → Target KPI** memuat target tahunan per perusahaan: revenue won bidding (dan bagian *Direct*), cash-in, EBITDA % dan Net Margin %.

- **Direktur PT** (kursi Direktur yang dibatasi pada perusahaannya) mengisi target, melampirkan **keputusan direksi**, lalu *Ajukan ke BOD*.
- **BOD** (kursi Direktur untuk semua entitas) *Setujui* atau *Kembalikan* dengan catatan. Pengaju tidak bisa menyetujui, dan persetujuan butuh dokumen terlampir.
- Target **aktif** hanya berubah lewat versi baru yang disetujui BOD; sampai itu versi lama tetap berlaku.
- **Realisasi** otomatis: nilai deal Won Bidding dan Closed Won, penerimaan kas, serta EBITDA dan laba bersih dari Laba Rugi. Target sampai bulan ini memakai persentase bulanan di menu Skenario (awalnya sheet 22_Assumptions).
- **Konsolidasi** adalah jumlah perusahaan; margin ditimbang menurut target revenue.

## Kesehatan KPI

Menu **Kinerja → Kesehatan KPI** menilai 10 KPI sheet 08_KPI_Thresholds untuk bulan yang dipilih: **SEHAT**, **WASPADA** atau **KRITIS**, dengan saran tindakan bila tidak sehat.

- Angka arus (EBITDA, margin, cash in/out, budget) **tahun berjalan** sampai bulan itu; neraca memakai total terakhir yang diisi di Tutup Buku.
- Rencana kas memakai proyeksi **Arus Kas**; realisasi kas dari **Kas Mingguan**; budget biaya dari RKA tanpa CAPEX.
- Capital Efficiency memakai EBIT yang disetahunkan. EBITDA positif di bawah 1% pendapatan dinilai WASPADA.
- KPI tanpa data ditandai *Belum ada data*: realisasi cash in/out selama belum ada kas masuk atau keluar tercatat, dan Budget Utilization selama belum ada biaya.
- **Stress test:** kas masuk rencana turun 20% (saldo terendah proyeksi); liabilitas jatuh tempo 3 bulan di atas 40% total liabilitas (pinjaman bank dan tagihan vendor); satu customer di atas 50% pendapatan.

## Peringatan Dini

Menu **Kontrol → Peringatan Dini** menjalankan aturan EW-01 sampai EW-15 sheet P3_Module_Spec (P3-M4) untuk seluruh grup, atau per divisi/unit untuk EW-08 dan EW-09. Diperiksa setiap hari; Finance atau Head FRM bisa menekan **Periksa sekarang**.

- Peringatan ditugaskan ke pemilik aturan (Head FRM, Direktur, Cash Management, kepala BCD/PMO/HCM atau divisi); bila kursinya kosong, ke Head FRM, lalu Direktur grup. Aturan ber-email mengirim satu email ringkas per orang.
- Kolom **Data** pada daftar aturan menandai aturan yang *Belum ada data*; tidak adanya peringatan untuk aturan itu bukan berarti aman. EW-01 memakai kas yang sudah dicatat, bukan proyeksi Arus Kas.
- Pemilik menekan **Terima**, lalu **Selesaikan** atau **Salah alarm** dengan catatan.
- Belum diterima dalam 1/2/3/7 hari (Critical/High/Medium/Low) naik ke Head FRM; dua kali lipatnya naik ke Direktur.
- Kondisi yang pulih ditutup otomatis. Peringatan yang ditutup pemilik baru muncul lagi setelah 7 hari bila kondisinya masih ada.
- EW-07 dan EW-10 belum dinilai karena margin kontrak dan target konversi belum dicatat. Notifikasi WhatsApp dan snooze belum ada. Peringatan Critical juga membuat risiko di Register Risiko.

## Register Risiko

Menu **Kontrol → Register Risiko** (sheet P3_Module_Spec P3-M3 dan EXEC_20). Skor = likelihood × impact (1–5): **Critical** 20 ke atas, **High** 15–19, **Medium** 8–14, **Low** di bawah 8. Heatmap 5×5 bisa diklik untuk menyaring.

- Finance, Head FRM dan Direktur menambah dan mengubah risiko perusahaannya (atau grup). High dan Critical wajib punya rencana aksi dan tenggat.
- Pemilik mencatat **Tindakan**, **Review skor** (jadwal review maju satu bulan) atau **Ubah status**, dengan bukti bila ada. Auditor membaca; pemilik melihat risikonya sendiri.
- **Ditutup** butuh bukti dan catatan; **Diterima** butuh catatan. Keduanya diputuskan Head FRM atau Direktur yang bukan pemiliknya; menerima risiko Critical hanya Direktur grup (BOD).
- Peringatan Dini Critical (EW-01, EW-02, EW-12) otomatis membuat risiko bila belum ada yang berjalan.
- Pemilik menerima satu email bila ada risiko yang jatuh tempo review. Risiko tidak bisa dihapus.

## Laporan Berkala

Menu **Kinerja → Laporan Berkala** (Finance, Head FRM, Direktur, Auditor) mengikuti sheet FC09_Reporting: bulanan, triwulan, semester atau tahunan, per perusahaan atau konsolidasi. Jenis: Laba Rugi, Neraca, Arus Kas, Realisasi vs RKA, Umur Piutang, Sales, Implementasi, Obligo Bank.

1. Finance memilih jenis dan periode lalu **Buat draft**. Membuat ulang draft yang sama memperbarui angkanya.
2. Pembuat menekan **Ajukan review**. Laba Rugi, Neraca, Arus Kas dan Realisasi vs RKA hanya bisa diajukan bila semua bulannya sudah ditutup, dan angkanya diambil ulang saat itu.
3. User Finance lain menekan **Selesai direview**, lalu Head FRM **Setujui**. Pembuat, reviewer dan penyetuju harus orang berbeda; reviewer dan Head FRM bisa **Kembalikan** dengan alasan.
4. Finance **Distribusikan**; Direktur dan Auditor menerima email.

Laporan yang disetujui tidak bisa diubah atau dihapus; perubahan dibuat sebagai versi baru. Umur Piutang, Sales, Implementasi dan Obligo memuat posisi saat dibuat. **Unduh Excel** dan **Cetak / PDF** menyertakan kop perusahaan, nama penandatangan dan watermark (DRAFT sebelum disetujui); tanpa tanda tangan digital. Direktur hanya melihat laporan yang sudah disetujui.

## Dashboard BOD

Menu **Kinerja → Dashboard BOD** (Direktur, Auditor, Head FRM) mengikuti sheet 18_Dashboard_Spec_BOD. Pilih bulan; entitas mengikuti filter tampilan. Angka dihitung saat halaman dibuka.

- 8 kartu KPI dengan status; **Rincian** berisi rumus, saran dan tautan ke layar sumber.
- Revenue won bidding dan cash-in terhadap target KPI yang disetujui; tren kas dan EBITDA; proyeksi kas 12 bulan.
- Pipeline, obligo per bank (porsi di atas 50% ditandai), umur piutang, assurance JPMB, Business Health Check dan 10 proyek terbesar.
- **Stress test:** geser persentase penurunan kas masuk, tekan **Hitung**.
- **Highlight bulanan** ditulis Direktur atau Head FRM untuk perusahaan yang ditampilkan; Auditor hanya membaca.
- **Cetak / PDF** mencetak tampilan saat ini. Setiap kunjungan dicatat di audit.

## Portofolio Proyek

Menu **Penjualan → Portofolio Proyek** (Finance, Direktur, Auditor, Head FRM): per proyek nilai kontrak, revenue (invoice terbit, DPP), COGS (pembayaran lunas akun COGS), gross profit dan GP %, kas masuk, piutang dan BG aktif.

- Status: **Won** (Initiation), **Active**, **Closed**, **Drop**.
- **Delayed** bila target RFS atau tanggal rencana site terlewat; **At-risk** bila ada site terkendala atau target RFS tinggal 14 hari; selain itu **On-track**.
- Klik nama proyek untuk melihat invoice, pembayaran dan BG; klik lagi untuk membuka transaksinya.

## Profitabilitas Proyek

Menu **Penjualan → Profitabilitas Proyek** (sheet 29_Project_Profitability) untuk Finance, Direktur, Auditor dan Head FRM.

- **Gross profit** = nilai kontrak − pembayaran lunas akun COGS. **EBITDA** = gross profit − porsi OPEX. **Net** = EBITDA setelah pajak (asumsi pajak Arus Kas, bila kosong 22%).
- **Porsi OPEX:** OPEX RKA tahun itu per perusahaan (sesudah alokasi biaya bersama), dibagi ke proyek yang masih berjalan menurut nilai kontrak. Proyek Closed tidak mendapat porsi sehingga tidak dinilai.
- **Rating** dari EBITDA %: ★★★ Excellent ≥ 20, ★★ Good ≥ 12, ★ Marginal ≥ 5, selain itu ⚠ Loss Risk. Proyek tanpa biaya tercatat belum diberi rating.
- Biaya yang dipakai baru yang sudah dibayar, jadi margin proyek berjalan masih akan turun. Daftar 3 teratas dan terbawah memakai net profit proyek yang sudah dinilai.

## Master Data

Menu *Master Data* memuat satu tab per master. Semua peran dapat membaca Customer, Mitra dan Produk Mitra; yang mengubah hanya pengelolanya:

| Master | Pengelola |
| --- | --- |
| Customer | Sales (staf dan kepala di BCD) |
| Mitra dan Produk Mitra | SCM (staf dan kepala di SCM) |
| Karyawan | HCM (staf dan kepala di HCM) |
| COA | Finance Reviewer, di menu *COA Master*, dengan persetujuan Finance Controller |

Admin juga dapat mengubah Customer, Mitra, Produk Mitra dan Karyawan.

- **Tambah dan Ubah**: *Tambah customer*, *Tambah mitra*, *Tambah produk* atau *Tambah karyawan*, atau *Ubah* pada barisnya, lalu *Simpan*. ID baru diberi aplikasi (karyawan memakai NIP yang diketik sekali) dan setiap perubahan tercatat di jejak audit.
- **Karyawan dan akun**: menyimpan karyawan tidak membuat akun. Admin mengundang akun di menu *Pengguna*; akun dengan email yang sama terhubung ke karyawannya. Menonaktifkan karyawan tidak menonaktifkan akunnya.
- **Tidak ada hapus**: data yang tidak dipakai lagi dimatikan lewat *Aktif*. Yang nonaktif tidak dapat dipilih pada deal atau permintaan pembayaran baru, tetapi tetap tampil di data lama.
- **NPWP customer** tidak boleh sama dengan customer lain, kecuali nomor sementara. NPWP mitra boleh kosong, dengan peringatan, tetapi wajib sebelum bertransaksi.
- **Perlu ditinjau**: nilai yang meragukan (NPWP kosong atau sementara, email tidak valid atau dipakai bersama, nama ganda) ditulis di bawah namanya. Centang *Hanya yang perlu ditinjau* untuk melihatnya saja.
- **Karyawan** hanya dapat dibuka HCM, Admin, Direktur dan Auditor.

## Pipeline

Register deal yang dikelola BCD; Finance Reviewer, Direktur dan Auditor membacanya. Pipeline tidak pernah dijumlahkan ke pendapatan RKA. Layar ini juga memasang kontrol atas selisih angka penjualan yang ditemukan di RKA 2027.

- **Kartu di atas**: nilai pipeline (dasar: seluruh pipeline, tanpa PPN), Won Bidding (dasar: Won Bidding saja), pipeline tertimbang (nilai dikali probabilitas) dan target pendapatan BCD dengan coverage-nya.
- **Dua dasar, selalu disebut**: *seluruh pipeline* menjumlahkan semua deal; *Won Bidding saja* hanya deal berstatus WB dan CW. Keduanya tampil berdampingan di tabel **Per segmen** supaya tidak terbaca sebagai angka yang setara.
- **Coverage** = pipeline tertimbang dibagi target segmen. Segmen dengan coverage di bawah 1,0x ditandai merah dan wajib memiliki **rencana pemulihan** tertulis. Rencana ditulis oleh Sales Head (Division Owner BCD) lewat *Simpan rencana*, tercatat nama dan tanggalnya di jejak audit; peran lain hanya membacanya.
- **Per COA pendapatan**: jumlah deal, nilai dan tertimbang per COA, yaitu angka yang dibaca RKA sebagai pendapatan per COA.
- **Daftar deal** mengikuti Entitas di kepala halaman, dengan filter segmen dan status serta pencarian customer atau project.
- **BCD menambah atau mengubah deal** dengan *Tambah deal* atau *Ubah*: entitas, customer (dipilih dari Master Customer), end customer, segmen, project, COA pendapatan, nilai tanpa PPN, status, probabilitas, jenis (New atau Renewal), bulan mulai dan selesai, lead time dan Billing Termin. *Simpan deal* menyimpan dengan jejak audit; *Hapus deal* menghapus.
- **COA pendapatan wajib** dan harus akun pendapatan yang aktif di COA Master.
- **Nama project harus unik** per tahun dan entitas, karena menjadi Kode Proyek saat deal menang. Huruf besar kecil dan spasi diabaikan.
- **Lead time (bulan)**, 0 sampai 24: jarak dari bulan mulai ke belanja PDMS. Boleh dikosongkan.
- **Customer dari Master Customer**: wajib dipilih di *Customer (Master Customer)*; nama customer mengikuti nama panggilan di master. Bila belum ada, tambahkan dulu di menu *Master Data*. Deal lama yang belum terhubung tidak dapat disimpan ulang sebelum customer-nya dipilih.
- **Perlu dirapikan: customer**: kartu ini mendaftar deal yang belum terhubung ke Master Customer, termasuk nama yang dipakai dua customer. BCD menghubungkannya lewat *Ubah*.
- **Perlu dirapikan**: deal hasil impor yang belum memiliki COA atau memakai nama project yang sama dihitung di peringatan di atas tabel. Deal itu tetap tampil, tetapi tidak dapat disimpan ulang sebelum diperbaiki.

### Billing Termin dan Closed Won

Billing Termin adalah satu-satunya sumber rencana invoice dari Pipeline, sehingga ringkasan selalu sama dengan jumlah detailnya.

- Di formulir deal, *Tambah termin* menambah satu rencana invoice: nilai tanpa PPN, tanggal rencana dan keterangan. Jumlah termin tidak boleh melebihi nilai kontrak.
- Status **CW (Closed Won)** berarti kontrak sudah ditandatangani: probabilitas menjadi 100% dan deal baru dapat disimpan bila jumlah termin tepat 100% nilai kontrak, masing-masing dengan tanggal rencana.
- Kartu **Rencana invoice dari Billing Termin** menjumlahkan termin per bulan untuk tahun berjalan, lalu per project menampilkan nilai kontrak, invoice tahun ini dan nilai yang **jatuh ke tahun berikutnya** (nilai kontrak dikurangi invoice tahun ini). Kartu ini memuat semua deal Closed Won dan deal lain yang sudah memiliki termin.
- Rencana invoice ini tampil berdampingan dengan RKA; baris pendapatan RKA tidak diubah olehnya.

| Status | Arti | Rentang probabilitas |
| --- | --- | --- |
| PP | Potential | 0 sampai 30% |
| PT | Potential | 30 sampai 60% |
| QO | Quotation | 60 sampai 70% |
| WB | Won Bidding | 70 sampai 90% |
| CW | Closed Won | 100% |

Probabilitas di luar rentang statusnya memunculkan peringatan, tetapi tetap bisa disimpan.

### Status, SPH dan dokumen legal

- **Status** berurutan: Potential Prospect (PP), Qualified (PT), POC (PC, boleh dilewati), SPH (QO), Negotiation (NG), Admin Kontrak (AK), Won Bidding (WB), Closed Won (CW). Naik satu tahap demi satu tahap; mundur boleh. Deal baru paling jauh SPH. **Drop** (DR) atau **Cancel** (CX) dari tahap mana pun sebelum Closed Won, dibuka kembali hanya ke Potential Prospect, dan tidak dihitung dalam total.
- Naik melewati SPH (ke Negotiation dan sesudahnya) butuh **SPH yang disetujui**. Deal yang sudah di sana sebelumnya tidak terpengaruh.
- Menu **Pipeline → SPH**: Sales membuat SPH (harga, COGS, uraian); nomornya otomatis per PT per tahun. **BFP** mereview pricing, lalu **Head BusDev** menyetujui (Direktur bila Head BusDev penulisnya). Pembuat, pereview dan penyetuju harus berbeda. SPH yang dikembalikan diperbaiki lalu *Kirim ulang*.
- Pada form deal: sub segmen, model bisnis, kategori produk, PIC Sales dan Presales, pemilik kontrak (bila PT afiliasi Korlantas), serta status dokumen **P6/BAKN → P8/SPPBJ → Kontrak** (Draft, Sirkulir, Done) yang harus berurutan. Deal yang sudah memiliki SPH tidak bisa dihapus.

### Jadwal termin

- Pada form deal, isi **Tanggal SPPBJ** lalu *Isi jadwal default*: DP 15% (SPPBJ + 30 hari), termin progress 80% (SPPBJ + 3 bulan) dan retensi 5% (6 bulan sesudah progress). Daftar termin diganti; nilai dan tanggal boleh diubah. Termin yang sudah ditagih tidak bisa diubah atau dihapus.
- Kartu **Termin: rencana dan tagihan** membandingkan rencana per bulan dengan invoice yang sudah terbit, dan mendaftar termin yang **Terlambat** (lewat tanggal rencana, invoice belum terbit) atau invoicenya masih disiapkan.

## Implementasi

### Pembukaan proyek dan kontrak

- Saat deal berpindah ke **Won Bidding**, form Pipeline meminta **jumlah lokasi kontrak** dan proyek dibuat otomatis; nama, customer dan PT diwarisi dari deal dan tidak diubah di proyek. Deal won lama tanpa proyek tetap bisa dibuka manual oleh BCD.
- Kartu **Kontrak** di halaman proyek: **BCD** mencatat tanggal terima P8/SPPBJ; **Legal & Contract Management** mencatat nomor, tanggal (tidak sebelum P8), durasi dan term of payment (Lumpsum, Turnkey, Termin); **Head PMO** menetapkan PIC Legal, SCM, PM, OPS, HRD dan Finance.
- Nomor kontrak tidak boleh sama untuk customer yang sama, dan proyek **tidak bisa ditutup** tanpa nomor kontrak.

Proyek pelaksanaan dicatat **per lokasi (site)**, lalu diringkas ke proyek. PDMS (PMO, SCM, ISO, MSO), BCD, Finance Reviewer, Direktur dan Auditor membacanya, dalam entitas masing-masing.

- **Membuka proyek**: deal Won Bidding atau Closed Won yang belum punya proyek tampil di kartu **Deal menang tanpa proyek** (Pipeline juga menyebut jumlahnya). BCD mengisi **jumlah lokasi kontrak** lalu *Buka proyek*. Nama project deal menjadi nama proyek. Deal yang sudah memiliki proyek tidak dapat dihapus dan statusnya tetap Won Bidding atau Closed Won.
- **Tim proyek**: Head PMO (Default Owner atau Division Owner PMO, atau Head PDMS) menetapkan Project Manager, Delivery Control dan Project Admin dari orang PMO lewat *Simpan tim*. Delivery Control tidak boleh merangkap Project Manager maupun Project Admin, karena pelaksana instalasi tidak memverifikasi hasilnya sendiri dan pengumpul BAI bukan pengompilasinya.
- **Lokasi**: Project Manager mendaftarkan lokasi dengan *Tambah lokasi* (kode, nama, alamat, wilayah, PIC pelanggan, rencana selesai) sampai jumlahnya sama dengan jumlah lokasi kontrak. Project Manager dan Project Admin memperbaruinya dengan *Ubah*. Kode lokasi unik per proyek.
- **Status lokasi** yang dipilih manual: Belum mulai, Survei, Staging, Dikirim, Instalasi, Uji, Terkendala. Status BAI terbit, BAI terverifikasi dan Selesai mengikuti BAI lokasi dan tidak dipilih manual. Proyek berpindah dari Initiation ke Implementasi saat lokasi pertama masuk Staging atau lebih lanjut.
- **Progres** = lokasi berstatus Selesai dibagi jumlah lokasi kontrak, bukan dibagi lokasi yang sudah terdaftar.
- **Terlambat** dihitung sistem: hari sejak tanggal rencana selesai sampai tanggal aktual selesai, atau sampai hari ini bila belum selesai. Tidak diketik.
- **Menghapus lokasi**: Project Manager dapat *Hapus* (dengan konfirmasi) lokasi yang salah didaftarkan, selama statusnya masih Belum mulai atau Survei, belum memiliki BAI, dan proyek belum melewati tahap Implementasi. Lokasi yang sudah dikerjakan tidak dapat dihapus karena menjadi bukti.
- **Mengubah jumlah lokasi kontrak** (addendum): BCD mengisi jumlah baru dan dasar perubahannya (misalnya nomor addendum) di kartu *Lingkup kontrak*. Jumlah baru tidak boleh di bawah lokasi yang sudah terdaftar, dan tidak dapat diubah setelah BAST disahkan.
- **Hentikan proyek (Drop)**: Head PMO dapat menghentikan proyek yang tidak jadi dikerjakan, dengan alasan dan konfirmasi, hanya sebelum BAST disahkan. Proyek berstatus Drop atau Closing hanya dapat dibaca; data yang sudah tercatat tetap tersimpan.
- Setiap perubahan tercatat di jejak audit.

### Perencanaan

Tautan *Perencanaan* di halaman proyek.

- **Initiation**: Project Manager mencatat rujukan notulen kick-off, Project Admin mencatat rujukan MoM kick-off. Rujukan adalah tempat berkas disimpan. Head PMO lalu menekan *Sahkan Kick-Off Gate*.
- **Planning**: Project Manager mencatat Project Charter (timeline dan anggaran) dan Risk Register; Project Admin mencatat berkas kebutuhan administrasi. Setelah Kick-Off Gate disahkan, tim lengkap dan charter serta risk register tercatat, Head PMO mengisi **target RFS** dan menekan *Sahkan baseline*.
- **Setelah baseline**: pekerjaan lapangan lokasi (Staging, Dikirim, Instalasi, Uji) baru dapat dimulai; sebelumnya hanya survei. Perubahan rencana sesudah baseline menjadi change order.
- Head PMO yang juga anggota tim proyek tidak dapat mengesahkan gate dan baseline proyek itu.
- **Kurva S**: lokasi selesai kumulatif per bulan terhadap jumlah lokasi kontrak. Rencana dihitung dari tanggal rencana selesai tiap lokasi, aktual dari tanggal aktual selesai; selisih negatif ditandai merah.

### BAI per lokasi

Tiga tangan memegang satu dokumen, dan satu orang tidak boleh memegang dua langkah:

1. **Delivery Control** mencatat BAI lokasi berstatus Uji dengan *Catat BAI*: nomor, tanggal dan rujukan evidence (tempat berkas foto dan hasil uji disimpan). Status lokasi menjadi BAI terbit.
2. **Project Admin** memeriksa evidence lalu *Kompilasi BAI*. Untuk lokasi sampel uji petik, centang *Uji petik lulus* lebih dahulu. Status menjadi BAI terverifikasi.
3. **Assurance (orang BCD)** memeriksa kesesuaian dengan kontrak lalu *Verifikasi BAI*. Status menjadi Selesai dan lokasi dihitung ke progres. Bila tanggal aktual selesai masih kosong, tanggal BAI dipakai, sehingga hitungan terlambat berhenti.

Project Admin dan Assurance dapat *Kembalikan* BAI dengan alasan; lokasi kembali ke status Uji dan BAI dicatat ulang oleh Delivery Control.

### Ketepatan waktu BAI

Kartu *Ketepatan waktu BAI* di halaman proyek menunjukkan, per pemegang langkah, berapa lokasi tepat waktu dan terlambat: Delivery Control 7 hari sejak tanggal BAI, Project Admin 5 hari sejak BAI dicatat, Assurance 3 hari sejak BAI dikompilasi. Langkah yang masih berjalan melewati targetnya dihitung terlambat; yang masih di dalam target tidak ikut persentase.

### RFS dan BAST

- **RFS (Ready For Service)**: Project Manager mengisi tanggal dan *Nyatakan RFS* setelah semua lokasi kontrak terdaftar dan lulus uji. Head PMO mengesahkannya dengan *Sahkan RFS*.
- **BAST**: Project Admin mengisi nomor dan tanggal lalu *Siapkan BAST* setelah RFS disahkan dan jumlah BAI terverifikasi sama dengan jumlah lokasi kontrak (dan, untuk pelanggan skema TELKOM, BARD dan BAUT tercatat). Head PMO mengesahkannya dengan *Sahkan BAST*, dan proyek masuk tahap Penagihan.
- Yang mengajukan tidak dapat mengesahkan pengajuannya sendiri. Syarat yang belum terpenuhi ditulis di kartunya.
- **BARD dan BAUT** (hanya pelanggan skema TELKOM): BCD mencentang *Pelanggan skema TELKOM* di kartu BARD dan BAUT; setelah RFS disahkan, Assurance mencatat nomor dan tanggal BARD dan BAUT. BAST skema TELKOM baru dapat disiapkan setelah keduanya tercatat.

### Serah terima ke MSO dan ISO

Tautan *Serah terima* di halaman proyek membuka empat gerbang berurutan. Penerima resmi adalah MSO; ISO menerima turunan teknisnya.

1. **Paket serah terima**: tim proyek (Project Manager, Delivery Control, Project Admin) mengisi rujukan 15 artefak, yaitu tempat berkasnya disimpan, lalu *Simpan paket*. Tiga belas artefak wajib; artefak 8 (akses repository dan CI/CD) wajib bila proyek menyerahkan aplikasi; artefak 14 (manual pengguna) dianjurkan. Project Manager menekan *Ajukan ke MSO* setelah BAST disahkan dan semua artefak wajib terisi.
2. **Lima kriteria Head MSO** (Default Owner atau Division Owner MSO): ruang lingkup kontrak, ambang batas SLA, ketersediaan spare parts, topologi dan konfigurasi teknis, kelengkapan administrasi. Bila semuanya terpenuhi, *Terima serah terima*: tanggal itu menjadi tanggal berpindahnya tanggung jawab layanan dan proyek masuk tahap Layanan. Bila ada yang kurang, *Kembalikan ke PMO* dengan catatan; paket berstatus Dikembalikan dan dapat dilengkapi lalu diajukan lagi. Yang mengajukan paket tidak dapat menerimanya.
3. **Empat checklist Staff Operational EOS** (orang MSO-EOS): perangkat cadangan, lisensi, topologi jaringan, akses remote, disimpan dengan *Simpan checklist*.
4. **Head ISO** (Default Owner atau Division Owner ISO) menekan *Terima turunan teknis* setelah MSO menerima dan keempat checklist lengkap.

Status paket: Disusun, Diajukan, Dikembalikan, Diterima MSO, Diterima ISO, lalu Selesai saat proyek ditutup. Setiap langkah tercatat di jejak audit.

### Garansi dan penutupan

Tautan *Garansi & penutupan* di halaman proyek. Aturan di bagian ini sudah disetujui Head PDMS.

- **Masa peralihan**: selisih hari antara tanggal BAST dan tanggal MSO menerima. Tanggung jawab layanan berpindah pada tanggal MSO menerima, bukan tanggal BAST; masa peralihan tetap tanggung jawab PMO.
- **Akhir garansi**: BCD mengisi tanggal akhir garansi terakhir dengan *Simpan akhir garansi*, setelah BAST disahkan dan tidak sebelum tanggal BAST. Setelah ISO menerima turunan teknis dan tanggal ini terisi, proyek masuk tahap Garansi.
- **Cacat bawaan proyek**: orang ISO atau MSO melaporkan gangguan yang diduga bawaan proyek dengan *Laporkan*, setelah MSO menerima serah terima. Gangguan menjadi cacat bawaan hanya bila **Head ISO dan Head PMO sama-sama menetapkannya**; pelapor tidak dapat menetapkan laporannya sendiri dan satu orang tidak dapat menetapkan kedua sisi. Salah satu dari keduanya dapat menetapkannya sebagai *Gangguan operasional* dengan alasan, kecuali atas laporan yang ia buat sendiri; gangguan itu ditangani ISO.
- **Perbaikan**: Delivery Control proyek mencatat perbaikan cacat bawaan dengan *Catat perbaikan*, lalu Head PMO menekan *Tutup*.
- **Biaya**: cacat bawaan dibebankan ke anggaran proyek, dengan klaim ke vendor lewat RMA bila perangkat bergaransi. Gangguan operasional dibebankan ke anggaran layanan dengan persetujuan Head ISO. Keterangannya tampil di baris laporan setelah dikelompokkan; nominal belum dicatat.
- **Penutupan proyek**: Head PMO menekan *Nyatakan proyek ditutup* setelah MSO dan ISO menerima, masa garansi berakhir dan tidak ada laporan atau cacat bawaan yang terbuka. Laporan yang masih terbuka memperpanjang masa garansi sampai ditutup. Proyek berstatus Closing dan paket serah terima berstatus Selesai. Syarat yang belum terpenuhi ditulis di kartunya.

Kewenangan di layar ini mengikuti usulan matriks kewenangan PDMS yang masih menunggu pengesahan Head PDMS.

## Arus Kas

Proyeksi arus kas bulanan per entitas dan konsolidasi, menggantikan Forecast CF Bulanan, keempat sheet CF dan Obligo Pinjaman Bank. Finance mengisi asumsi dan pinjaman; Direktur dan Auditor membaca.

**Cara menghitung**, untuk versi yang sedang dilaporkan:

1. Laba rugi dari baris RKA per entitas setelah alokasi biaya bersama. Penyusutan mengurangi laba, tidak mengurangi kas. COA bunga di RKA diganti bunga dari pinjaman.
2. Kas masuk: invoice tertagih setelah lag penagihan (2 bulan); piutang awal tertagih Januari.
3. Kas keluar: COGS dibayar setelah lag vendor (1 bulan), utang usaha awal dibayar Januari; OPEX, gaji, bunga dan biaya bank dibayar di bulan berjalan. Pajak adalah laba setahun dikali tarif PPh, dibayar 12 angsuran, ditambah PPh 29 tahun lalu di April.
4. Investasi dan pendanaan: Capex dibayar di bulannya; penarikan pinjaman menambah kas, pelunasan mengurangi.
5. Saldo akhir sama dengan saldo awal ditambah arus kas bersih. Di bawah saldo kas minimum, selisihnya tampil sebagai *Kebutuhan tambahan pendanaan*.

**Membaca**: Entitas di kepala halaman memilih entitas; *Semua entitas* menampilkan Konsolidasi. Kartu menunjukkan saldo kas akhir Desember, saldo terendah dan bulannya, kebutuhan pendanaan tertinggi dan arus kas operasi setahun. Grafik *Saldo kas akhir per bulan* memberi area merah di bawah saldo minimum; *Jembatan arus kas setahun* menunjukkan dari saldo awal ke saldo akhir, hijau menambah kas dan merah mengurangi. Di bawahnya tabel bulanan dan laba rugi dasar arus kas.

**Asumsi (Finance)**: lag penagihan dan pembayaran, tarif PPh, kas minimum konsolidasi, COA bunga yang diganti Obligo, COA non-kas, serta saldo 1 Januari setiap entitas. *Simpan asumsi* menyimpan dengan jejak audit.

**Pinjaman bank (Obligo)**: setiap fasilitas punya nama, jenis, entitas, suku bunga per tahun, saldo 1 Januari, plafon serta penarikan dan pelunasan per bulan. Bunga bulanan sama dengan outstanding akhir bulan dikali suku bunga dibagi 12. *Tambah fasilitas*, *Ubah*, *Simpan fasilitas* dan *Hapus fasilitas* mengubahnya; setiap perubahan diaudit.

**Tahun berikutnya**: saat tahun yang dipilih belum punya asumsi tetapi tahun sebelumnya punya, Finance mendapat tombol *Bawa saldo dari Arus Kas* tahun lalu. Aturan (lag, tarif, COA) tersalin; saldo awal setiap entitas diambil dari kas, piutang dan utang akhir Desember; pinjaman yang masih ada outstanding pindah sebagai fasilitas existing dengan saldo Desember, yang lunas tidak dibawa. Setelah itu cocokkan saldo awal dengan neraca audit dan isi PPh 29 tahun lalu, lalu *Simpan asumsi*.

## Fitur bersama

- **Halaman baris** (klik judul baris, atau *Diskusi*): bulan, Total RKA, dasar perhitungan, Actual tahun lalu dan perubahannya, dengan dua panel. **Riwayat** mencatat setiap perpindahan tahap: siapa, kapan dan catatannya; tidak bisa diubah. **Diskusi** untuk tanya jawab; berkomentar tidak mengubah tahap baris. Pembuat baris, pemegang saat ini dan pemberi komentar sebelumnya diberi tahu. Diskusi baris yang terkunci ditutup.
- **Satuan**: Angka penuh, Juta atau Miliar dari Tampilan di kepala halaman, untuk layar mana pun yang berisi angka. Pilihan diingat per pengguna; standarnya Juta. Nominal selalu disimpan sampai sen.
- **Angka laporan**: satuan tertulis sekali di kepala kolom (misalnya Rp juta), angka negatif dalam kurung, dan nol tampil sebagai tanda pisah. Merah hanya untuk hasil yang perlu diperhatikan, seperti laba atau saldo kas negatif. Kolom Uraian tetap di tempat saat bulan digulir, dan kolom Total berada di sampingnya, sebelum Januari.
- **Warna tahap**: Draft abu-abu, Konsolidasi biru muda, Persetujuan Divisi nila, Review Finance kuning, Menunggu Kunci ungu, Terkunci hijau; selalu disertai nama tahapnya.
- **Daftar kosong** menampilkan penjelasan dan langkah berikutnya, bukan halaman kosong.

## Email dan pengingat

**Notifikasi di kepala halaman.** Ikon lonceng menampilkan jumlah pemberitahuan yang belum dibaca. Klik untuk membuka daftarnya: baris yang masuk ke antrean Anda, usulan yang dikembalikan atau diminta klarifikasi (bertanda *Perlu diubah*), dan komentar baru di Diskusi. Klik satu pemberitahuan untuk membuka layarnya dan menandainya dibaca, atau *Tandai semua dibaca*. Setiap pemberitahuan ini juga dikirim lewat email.

Aplikasi mengirim satu email per serah terima, bukan per baris. Email tidak pernah memuat angka rupiah; setiap email berisi tautan ke layar tempat penerima bertindak.

| Kejadian | Penerima | Isi |
| --- | --- | --- |
| Finance membuka siklus | Semua Requestor | Siklus dibuka, dengan Batas pengajuan |
| Requestor mengirim baris | Default Owner unit pemilik | Baris menunggu konsolidasi |
| Default Owner mengembalikan | Requestor | Dikembalikan, dengan catatan |
| Default Owner meneruskan | Division Owner | RKA divisi menunggu persetujuan |
| Division Owner menyetujui | Finance Reviewer | Menunggu review |
| Division Owner mengembalikan | Default Owner unit pemilik | Dikembalikan, dengan catatan |
| Finance meminta klarifikasi | Division Owner | Perlu klarifikasi, dengan catatan |
| Finance memfinalisasi | Finance Reviewer | Siap dikunci; tautannya membuka Kunci RKA |
| Finance mengunci | Semua peserta siklus | RKA terkunci; tautannya membuka Management Summary, atau RKA Saya bagi peran yang tidak melihat Summary |
| Baris diserahkan ke kursi kosong | Admin | Tetapkan pjs |
| Komentar baru di Diskusi | Pembuat, pemegang, pemberi komentar | Komentar baru (paling banyak satu email per orang per jam) |
| 7, 3 dan 1 hari sebelum batas | Requestor dengan baris belum dikirim | Batas pengajuan dekat |
| Baris menunggu 3 hari atau lebih | Pemegangnya | Pengingat baris tertunda |
| Undangan atau lupa kata sandi | Pengguna itu | Buat atau atur ulang kata sandi |
| Permintaan Pembayaran dikirim | Atasan terdekat pemohon | Menunggu persetujuan, dengan nomor dan entitas |
| Atasan menyetujui | Business Finance (BFP) entitas itu | Perlu diperiksa |
| BFP meneruskan | Head Divisi pemohon (atau Direktur) | Menunggu persetujuan Head Divisi |
| Head Divisi menyetujui | Cash Management entitas itu | Siap dijadwalkan |
| Cash Management menjadwalkan | Pemohon | Dijadwalkan, dengan tanggal jadwal |
| Cash Management membayar | Pemohon | Sudah dibayar, dengan tanggal bayar |
| Permintaan dikembalikan | Pemohon | Dikembalikan, dengan alasan |
| Head PMO menetapkan tim proyek | Anggota tim yang baru ditetapkan | Penugasan proyek |
| Project Manager menyatakan RFS | Head PMO | RFS menunggu pengesahan |
| Project Admin menyiapkan BAST | Head PMO | BAST menunggu pengesahan |
| Head PMO mengesahkan BAST | Assurance (orang BCD entitas itu) dan Project Manager | Penagihan dan serah terima dapat dimulai |
| Project Manager mengajukan paket serah terima | Head MSO | Paket menunggu penilaian |
| Head MSO mengembalikan paket | Project Manager | Dikembalikan, dengan catatan |
| Head MSO menerima serah terima | Head ISO dan Staff Operational EOS | Tindak lanjut checklist dan turunan teknis |
| ISO atau MSO melaporkan dugaan cacat bawaan | Head ISO dan Head PMO | Menunggu penetapan bersama |
| Cacat bawaan ditetapkan bersama | Delivery Control proyek | Menunggu perbaikan |

Dua pengingat terakhir berjalan setiap hari pukul 08.00 WIB.

Email Implementasi dikirim per serah terima proyek, tidak per lokasi: langkah BAI per lokasi tidak mengirim email, dan orang yang melakukan langkah itu tidak dikirimi emailnya sendiri. Isinya hanya nama proyek, entitas dan tautan.

Email Permintaan Pembayaran juga tanpa nominal: hanya nomor permintaan, entitas, nama pemohon dan tautannya. Bila kursi tahap berikutnya kosong (misalnya belum ada BFP atau Cash Management untuk entitas itu), tidak ada email yang terkirim dan tidak ada pemberitahuan ke Admin; permintaan tetap menunggu di tab *Perlu tindakan* dan langsung terlihat oleh orang yang kemudian ditetapkan di kursi itu, termasuk pjs.

## Permintaan Pembayaran

Menu **Permintaan Pembayaran** memuat semua permintaan yang boleh Anda lihat, dalam tiga tab: *Perlu tindakan* (menunggu Anda), *Permintaan saya*, dan *Semua*. Siapa pun selain Admin dapat membuat permintaan dari posisinya; atasan dan Head Divisi ditentukan dari unit posisi itu.

| Status | Arti | Siapa yang bertindak |
| --- | --- | --- |
| Draft | Belum dikirim | Pemohon (staf HC, SCM, Sales, PST, dll.) |
| Submitted | Permohonan dikirim, menunggu persetujuan atasan | Atasan pemohon: Manager, Kepala Divisi atau Direktur |
| Under Review | Sedang diperiksa BFP | Business Finance (BFP) |
| Pending Approval | Menunggu persetujuan Head Divisi | Head Divisi pemohon; Direktur bila pemohon sendiri Head Divisi atau berada di luar divisi |
| Approval FRM | Di atas limit cost center, menunggu persetujuan Head FRM | Head Finance & Risk Management |
| Approval Direktur | Di atas limit cost center, menunggu persetujuan Direktur | Direktur |
| Approved | Disetujui, menunggu dijadwalkan | Cash Management |
| Scheduled | Sudah masuk jadwal pembayaran | Cash Management |
| Paid | Pembayaran sudah berhasil dilakukan | Selesai |
| Returned | Dikembalikan untuk perbaikan (alasan wajib) | Pemohon memperbaiki lalu mengirim lagi |

### Membuat dan mengirim

1. Klik *Buat permintaan*. Pilih jenis (Pembayaran atau Cash Advance), entitas, proyek/perusahaan, dan baris RKA. Baris yang tersedia berasal dari RKA tahun yang dipilih di Tampilan, untuk entitas posisi Anda dan unit di divisi Anda; selama RKA belum dikunci, baris dari versi yang sedang berjalan dipakai dan ditandai begitu.
2. Bila penerimanya mitra, pilih di *Mitra (Master Mitra)*: nama penerima terisi dari master, sedangkan bank dan nomor rekening tujuan tetap Anda isi (mengganti mitra mengosongkan keduanya). Mitra tanpa NPWP ditandai peringatan. Penerima di luar master diketik seperti biasa. Isi deskripsi, penerima (nama, bank dan nomor rekening tujuan), jatuh tempo, Nominal (DPP), PPN dan PPh dipotong. Angka diketik seperti biasa, misalnya 10.000.000. *Simpan draft*.
3. Di halaman permintaan, lampirkan dokumen satu per satu: pilih jenisnya (Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi, Delivery Note, atau Permohonan CA), pilih file PDF atau foto (JPG, PNG, WEBP) maksimal 4 MB, lalu *Lampirkan*. Pembayaran perlu minimal satu dokumen tagihan; Cash Advance perlu Permohonan CA.
4. Kotak *Tindakan Anda* menyebut apa yang belum lengkap. Setelah lengkap, *Kirim ke atasan*. Permintaan mendapat nomor PP/ENTITAS/TAHUN/BULAN/URUT saat pertama dikirim.
5. Bila dikembalikan, alasannya tampil di atas halaman. Perbaiki isian atau dokumen, lalu kirim lagi.

### Menyetujui, memeriksa, membayar

- Atasan dan Head Divisi membuka permintaan dari tab *Perlu tindakan*, lalu *Setujui* atau *Kembalikan* dengan alasan. Tidak ada yang bisa menyetujui permintaannya sendiri.
- **Di atas limit cost center:** bila Nominal (DPP) melebihi *Limit persetujuan* unit pemohon (atau unit terdekat di atasnya yang punya limit), sesudah Head Divisi permintaan disetujui **Head FRM** lalu **Direktur**. Untuk permintaan unit FRM, Head FRM hanya menyetujui sekali; permintaan Head FRM sendiri langsung ke Direktur. Unit tanpa limit mengikuti alur biasa.
- Menjadwalkan atau membayar permintaan yang Anda ajukan sendiri tetap bisa, tetapi diberi peringatan.
- BFP memeriksa dokumen dan kotak *Sisa anggaran baris RKA*, lalu *Teruskan ke Head Divisi* atau *Kembalikan*.
- Cash Management menjadwalkan: pilih *Tanggal jadwal* dan *Bank asal* dari Rekening Bank entitas itu, lalu *Jadwalkan*. Setelah transfer, isi *Tanggal bayar*, lampirkan *Bukti bayar*, lalu *Tandai sudah dibayar*.
- Dokumen dan bukti bayar hanya dibuka melalui aplikasi oleh orang yang boleh melihat permintaannya.
- Riwayat di bawah halaman mencatat siapa melakukan apa, kapan, dan alasannya.

### Aturan

- Pemohon memilih entitas/proyek dan baris RKA, mengisi deskripsi, nominal, PPN dan PPh, lalu melampirkan dokumen: Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi, Delivery Note, atau Permohonan CA untuk Cash Advance.
- Nominal Pembayaran (nett) = nominal + PPN − PPh yang dipotong.
- BFP melihat sisa anggaran baris RKA (rencana dikurangi Realisasi dan permintaan lain yang sudah disetujui tetapi belum dibayar). Melebihi anggaran ditandai, tidak diblokir.
- Cash Management memilih bank asal dan tanggal jadwal, lalu mengunggah bukti bayar dengan tanggal bayar.
- Pembayaran yang sudah Paid mengurangi sisa anggaran baris RKA-nya sebesar nominal sebelum pajak (DPP).
- Setiap perpindahan status mengirim satu email ke orang berikutnya, tanpa nominal.
- Saat Paid, nominal sebelum pajak (DPP) tercatat sebagai Realisasi pada baris RKA yang dipilih, di bulan tanggal bayarnya (lihat Realisasi). Pembayaran yang tanggal bayarnya di luar tahun RKA baris itu tidak dihitung ke tahun tersebut.

### Formulir Permohonan Pembayaran

Setelah permintaan bernomor (sudah pernah dikirim), tautan *Formulir Permohonan Pembayaran* di kanan atas halaman permintaan membuka formulir siap cetak di tab baru: nomor, pemohon, baris RKA, deskripsi, penerima, rincian nominal (DPP, PPN, PPh dan nett) dengan terbilang, dokumen terlampir, bank asal, jadwal dan tanggal bayar. Kotak persetujuan (Pemohon, Atasan, BFP, Head Divisi, bila ada Head FRM dan Direktur, Cash Management) terisi nama, peran dan waktu persetujuan dari riwayat; persetujuan sebelum permintaan terakhir dikembalikan tidak dihitung. Klik *Cetak / simpan PDF* untuk mencetak satu lembar A4 atau menyimpannya sebagai PDF. Formulir tidak memerlukan tanda tangan basah.

### Rekap Pembayaran

Menu *Rekap Pembayaran* (Finance Reviewer, BFP, Cash Management, Direktur, Auditor) memuat permintaan berstatus Paid menurut tanggal bayarnya: Tanggal bayar, Nomor, Deskripsi, Entitas, Bank asal dan Nominal (nett), dengan subtotal per hari atau per bulan, total, dan total per bank asal.

- *Rekap per* Hari (bawaan: bulan ini) atau Bulan (bawaan: tahun ini); *Dari* dan *Sampai* mengubah periodenya.
- *Bank asal* membatasi rekap ke satu rekening.
- Entitas dan Divisi di Tampilan ikut berlaku.
- *Unduh Excel* mengunduh rekap yang sama: lembar *Rekap Pembayaran* dan lembar *Per Bank*.

### Rekening Bank

Daftar bank asal pembayaran per entitas: nama bank, nomor rekening dan atas nama. Cash Management merawatnya; Admin boleh mengisinya pertama kali sebelum Cash Management punya akun. Nomor rekening yang sama tidak bisa didaftarkan dua kali. Rekening yang tidak dipakai lagi dinonaktifkan (hilangkan centang *Aktif*), tidak dihapus, supaya pembayaran lama tetap menunjuk rekeningnya. Entitas sebuah rekening tidak bisa diubah setelah dibuat.

## Setelah dikunci: revisi

Versi yang terkunci tidak pernah diubah; revisi menyalinnya menjadi versi baru yang melewati alur lagi. Finance melakukannya di Siklus RKA, *Buat revisi*.

1. Pilih versi yang terkunci. Revisi ditolak bila tahun itu sudah punya versi terbuka.
2. Pilih titik mulai (*Mulai revisi di*): **Draft** (semua divisi mengisi ulang; tetapkan Batas pengajuan baru dan semua Requestor menerima email) atau **Review Finance** (Finance menyesuaikan sendiri, lalu memfinalisasi dan mengunci lagi).
3. Versi baru mendapat nama berikutnya (misalnya v2) dan bertanda *Revisi dari* versi asal. Versi asal tetap terkunci dan dapat dibaca. Nama versi hanya tampil di Siklus RKA; layar lain menyebut semua versi sebagai RKA dan tahunnya (misalnya RKA 2027), dan pilihan Versi di Management Summary menandai salinan dengan *revisi*.

Rencana headcount, dasar alokasi biaya bersama dan headcount per entitas ikut tersalin. Tahun anggaran berikutnya dimulai dengan *Buka siklus baru*, bukan revisi.
`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The guide's top-level sections, for the contents list; ids match the rendered headings. */
export function guideSections(markdown: string): { id: string; title: string }[] {
  return [...markdown.matchAll(/^## (.+)$/gm)].map((m) => ({ id: slug(m[1]!), title: m[1]! }));
}

export const headingId = slug;

/** Where each role starts reading. */
export const ROLE_SECTION: Record<Role, string> = {
  requestor: "requestor-isi-dan-kirim",
  default_owner: "default-owner-konsolidasi-atau-kembalikan",
  division_owner: "division-owner-setujui-divisi",
  finance: "finance-review-finalisasi-dan-kunci",
  bfp: "permintaan-pembayaran",
  cash_manager: "permintaan-pembayaran",
  director: "direktur-dan-auditor",
  auditor: "direktur-dan-auditor",
  admin: "admin",
};
