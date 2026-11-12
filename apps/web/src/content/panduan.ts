import type { Role } from "@estrada/domain";

/**
 * The in-app user guide (Panduan), in Markdown. Update it in the same change as any behaviour a user can see:
 * panduan.test.ts fails when a menu screen, an approval state or a role is missing from it.
 * "[[alur]]" on its own line draws the approval flow diagram.
 */
export const PANDUAN = String.raw`
ERP Estrada menggantikan workbook RKA 2027. Setiap baris anggaran melewati enam tahap, dari Draft sampai Terkunci, dan di setiap tahap hanya satu peran yang dapat bertindak. Panduan ini mengikuti aplikasi yang berjalan sekarang.

## Alur RKA

[[alur]]

Hanya peran yang tertulis di kotak yang dapat bertindak atas baris di tahap itu. Mengembalikan atau meminta klarifikasi wajib disertai catatan. Versi yang sudah dikunci hanya berubah lewat revisi.

| Tahap | Dipegang oleh | Tindakan berikutnya |
| --- | --- | --- |
| Draft | Requestor | Kirim ke Default Owner |
| Konsolidasi | Default Owner | Kirim ke Division Owner, atau Kembalikan ke Draft |
| Persetujuan Divisi | Division Owner | Setujui & kirim ke Finance |
| Review Finance | Finance Reviewer | Finalisasi, atau Minta klarifikasi ke Persetujuan Divisi |
| Menunggu Kunci | Finance Reviewer | Kunci versi |
| Terkunci | Semua hanya membaca | Perubahan lewat revisi |

## Peran dan akses

Setiap pengguna memegang posisi: peran, unit organisasi, dan entitas yang boleh dilihat. Cakupan posisi meliputi unitnya dan semua unit di bawahnya. Finance Reviewer, Direktur, Auditor dan Admin melihat seluruh perusahaan.

| Peran | Menu | Boleh mengubah baris | Tindakan persetujuan |
| --- | --- | --- | --- |
| Requestor | Beranda, RKA Saya, Permintaan Pembayaran | Baris unitnya selama Draft | Kirim ke Default Owner |
| Default Owner | Beranda, RKA Saya, Antrean Konsolidasi, Permintaan Pembayaran | Baris dalam cakupannya selama Konsolidasi | Kirim ke Division Owner, Kembalikan (catatan wajib) |
| Division Owner | Beranda, RKA Divisi, Permintaan Pembayaran, Management Summary | Tidak | Setujui & kirim ke Finance |
| Finance Reviewer | Beranda, Status Board Finance, Kunci RKA, Siklus RKA, Permintaan Pembayaran, Rekap Pembayaran, Management Summary, Pipeline, Arus Kas, Realisasi, Biaya Bersama, COA Master | Baris di Review Finance | Minta klarifikasi (catatan wajib), Finalisasi, Kunci versi |
| Business Finance (BFP) | Beranda, Permintaan Pembayaran, Rekap Pembayaran, Panduan | Tidak | Memeriksa Permintaan Pembayaran (lihat bagian Permintaan Pembayaran) |
| Cash Management | Beranda, Permintaan Pembayaran, Rekap Pembayaran, Rekening Bank, Panduan | Tidak | Menjadwalkan dan membayar Permintaan Pembayaran |
| Direktur | Beranda, Kunci RKA, Siklus RKA, Permintaan Pembayaran, Rekap Pembayaran, Management Summary, Pipeline, Arus Kas | Tidak | Tidak ada, hanya membaca |
| Auditor | Beranda, Permintaan Pembayaran, Rekap Pembayaran, Management Summary, Pipeline, Arus Kas | Tidak | Tidak ada, membaca semua termasuk jejak audit |
| Admin | Beranda, Pengguna, Unit & Entitas, Struktur Organisasi, Rekening Bank | Tidak | Tidak ada; tidak melihat angka anggaran |

Orang BCD dengan peran Requestor, Default Owner atau Division Owner juga melihat menu Pipeline. Setiap halaman dan tindakan diperiksa di server sesuai aturan ini, jadi menu yang tersembunyi bukan satu-satunya pengaman. Semua peran melihat menu Panduan.

## Memulai

- **Masuk**: gunakan email kantor dan kata sandi. Akun dibuat oleh Admin lewat undangan email; tidak ada pendaftaran mandiri. *Lupa kata sandi?* mengirim tautan untuk membuat kata sandi baru.
- **Beranda**: ringkasan untuk peran Anda. Tiga kartu di atas menunjukkan *Menunggu tindakan Anda* (baris di antrean Anda), *Batas pengajuan* (sisa hari) dan *Sudah final* (porsi baris yang sudah difinalisasi atau dikunci). Di bawahnya ada tombol ke layar kerja Anda, *Posisi RKA*, serta *Aktivitas terbaru*. *Posisi RKA* berupa tabel: satu baris per divisi, satu kolom per tahap (Draft sampai Terkunci) berisi jumlah baris, lalu total baris dan porsi yang sudah final.
- **Menu**: dikelompokkan menjadi Anggaran, Laporan, Data dan Admin. Tombol panah di samping logo melipat menu menjadi ikon; pilihan ini diingat.
- **Posisi aktif**: pengguna yang memegang lebih dari satu posisi, atau menjadi pjs, berganti posisi di kepala halaman. Menu, cakupan dan antrean mengikuti posisi yang aktif.
- **Tampilan** (tombol di kepala halaman, misalnya *RKA 2027 · MATRIK · Juta*): klik untuk mengatur *Tahun anggaran*, *Entitas*, *Divisi* dan *Satuan*. Pengaturan berlaku untuk semua layar dan diingat per pengguna; tombol diberi warna saat entitas atau divisi dipersempit. Tahun standarnya tahun yang sedang terbuka; tahun yang sudah dikunci bertanda *(terkunci)* dan tetap dapat dibaca. Angka pembanding selalu dari tahun sebelumnya: membuka RKA 2028 menampilkan RKA 2027 dan Actual 2027. Entitas dan Divisi hanya mempersempit baris yang memang boleh Anda lihat; bila cakupan Anda hanya satu entitas atau satu divisi, namanya tampil tanpa pilihan. Divisi mengikuti unit Default Owner baris. Di ponsel tombol hanya menampilkan tahun dan jumlah filter yang aktif.
- **Filter aktif**: setiap layar yang dipersempit menulis *Filter aktif: …* di bawah judul, dengan tautan *Tampilkan semua* untuk kembali ke Semua entitas dan Semua divisi. Layar yang tidak memakai salah satunya menyebutkannya, misalnya Divisi di Arus Kas dan Pipeline. Kolom yang isinya sama di setiap baris karena filter (Entitas, atau Pemilik bila divisi hanya punya satu unit) disembunyikan.
- **Baris baru**: di RKA Saya, baris baru memakai entitas dari Tampilan di kepala halaman dan tetap dapat diubah. Draft Anda selalu tampil semua di editor; filter hanya mempersempit daftar *Sudah dikirim*.
- **Tema**: tombol di kepala halaman berganti antara Terang, Gelap dan Ikuti sistem.
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

RKA Saya terdiri dari tiga bagian: **Draft usulan** (baris yang masih bisa diubah), **Sudah dikirim** (baris yang sudah dikirim beserta tahapnya, hanya baca) dan **Rencana headcount** (rekrutmen baru yang menjadi baris gaji).

**Mengisi baris di Draft usulan**

1. Pilih COA, isi Uraian, Entitas dan Pemilik (unit pemilik biaya; boleh unit lain).
2. Ketik nominal Jan sampai Des dalam rupiah. Sel bulan tampil seperti spreadsheet: tanpa garis sampai disentuh, dan berbingkai biru saat diisi. Total RKA dihitung otomatis.
3. Untuk menyalin dari Excel, tempel satu baris atau satu blok ke sel bulan; nilainya mengisi bulan ke kanan dan baris ke bawah.
4. Tombol *Isi ke kanan* menyalin bulan yang dipilih sampai Des. Panah atas dan bawah berpindah baris.
5. Isi Dasar perhitungan. Baris tidak tersimpan bila COA tidak aktif atau tidak dikenal, entitas tidak dikenal, atau ada nominal negatif.
6. Baris yang berubah diberi warna. Bilah di bawah menunjukkan *N baris belum disimpan*; tekan *Simpan (N)* untuk menyimpan semuanya sekaligus. *Hapus baris* menghapus baris yang tidak diperlukan.

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

Bila Finance meminta klarifikasi, baris kembali ke RKA Divisi dengan catatan Finance. Jawab di Diskusi atau selesaikan dengan departemen, lalu setujui lagi. Division Owner juga dapat membuka Management Summary untuk angka divisinya.

## Finance: review, finalisasi dan kunci

Finance Reviewer memeriksa RKA semua divisi, meminta klarifikasi atau memfinalisasi, lalu mengunci versi final. Finance juga menjalankan siklus, merawat COA Master, mengisi Realisasi tahun lalu dan menentukan pembagian biaya bersama.

### Status Board Finance

Di atas, *Posisi RKA per divisi* berupa tabel dengan jumlah baris per tahap untuk setiap divisi, total baris dan porsi yang sudah final. Di bawahnya antrean baris di Review Finance.

1. Periksa konsistensi; Finance masih boleh mengoreksi nominal baris di Review Finance.
2. Centang baris lalu pilih *Minta klarifikasi* (kembali ke Persetujuan Divisi, catatan wajib) atau *Finalisasi* (pindah ke Menunggu Kunci).

### Kunci RKA

Daftar baris yang sudah difinalisasi. *Kunci versi* menguncinya: versi tidak dapat diubah lagi dan diskusinya ditutup. Semua peserta siklus menerima satu email. Direktur dapat membuka layar ini untuk membaca, tetapi penguncian adalah tugas Finance.

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

- *Daftar COA* tampil sebagai pohon per kategori. Kode induk punya panah untuk membuka atau menutup cabangnya; *Buka semua* dan *Tutup semua* membuka atau menutup semua cabang; *Cari kode atau nama* menemukan kode dan tetap menampilkan induknya.
- *Tambah atau ubah COA*: kode, nama, kategori, default owner, induk dan status. Induk harus berkategori sama dan tidak boleh membentuk lingkaran.
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
- **Bertindak sebagai** (kepala halaman): Admin dapat bertindak sebagai kursi mana pun untuk melihat aplikasi persis seperti peran itu, misalnya untuk memeriksa laporan masalah. Setiap pergantian tercatat di jejak audit; *Admin (saya sendiri)* kembali.

## Management Summary

Ringkasan RKA untuk Division Owner, Finance Reviewer, Direktur dan Auditor.

- **Filter**: Entitas, Divisi dan Satuan dari Tampilan di kepala halaman di kepala halaman; Versi dan Status di bilah atas layar ini. *Unduh Excel* di kanan atas mengunduh versi itu sebagai workbook dengan susunan RKA Data, Rekap, Kontribusi Divisi dan Per Entitas.
- **Empat kartu**: Pendapatan, Total Biaya, Laba Sebelum Pajak dan CAPEX, masing-masing dengan garis tren 12 bulan. Lencana perubahan terhadap tahun lalu muncul bila cukup baris punya angka RKA tahun lalu, dan dibandingkan atas baris yang sama.
- **Grafik**: pendapatan dan total biaya per bulan (batang) dengan laba sebelum pajak (garis), serta kontribusi per divisi.
- **Ringkasan per bulan**, **Kontribusi Divisi** dan **Per entitas** dalam tabel. Per entitas menampilkan alokasi biaya bersama bila ada.
- Pipeline tertimbang tampil sebagai satu baris terpisah di bawah kartu, di luar RKA.

## Pipeline

Register deal yang dikelola BCD; Finance Reviewer, Direktur dan Auditor membacanya. Pipeline tidak pernah dijumlahkan ke pendapatan RKA, yang berasal dari rencana invoice.

- Kartu di atas: nilai pipeline (tanpa PPN), pipeline tertimbang (nilai dikali probabilitas), target pendapatan BCD dan selisihnya.
- **Per segmen**: jumlah deal, nilai, tertimbang, target dan capaian untuk Telco, Government, Enterprise dan Territory Business.
- **Daftar deal** mengikuti Entitas di kepala halaman, dengan filter segmen dan status serta pencarian customer atau project.
- **BCD menambah atau mengubah deal** dengan *Tambah deal* atau *Ubah*: entitas, customer, end customer, segmen, project, COA pendapatan, nilai tanpa PPN, status, probabilitas, jenis (New atau Renewal) serta bulan mulai dan selesai. *Simpan deal* menyimpan dengan jejak audit; *Hapus deal* menghapus.

| Status | Rentang probabilitas |
| --- | --- |
| PP | 0 sampai 30% |
| PT | 30 sampai 60% |
| QO | 60 sampai 70% |
| WB | 70 sampai 90% |

Probabilitas di luar rentang statusnya memunculkan peringatan, tetapi tetap bisa disimpan.

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

- **Halaman baris** (klik baris mana pun): bulan, Total RKA, dasar perhitungan, Actual tahun lalu dan perubahannya, dengan dua panel. **Riwayat** mencatat setiap perpindahan tahap: siapa, kapan dan catatannya; tidak bisa diubah. **Diskusi** untuk tanya jawab; berkomentar tidak mengubah tahap baris. Pembuat baris, pemegang saat ini dan pemberi komentar sebelumnya diberi tahu. Diskusi baris yang terkunci ditutup.
- **Satuan**: Angka penuh, Juta atau Miliar dari Tampilan di kepala halaman, untuk layar mana pun yang berisi angka. Pilihan diingat per pengguna; standarnya Juta. Nominal selalu disimpan sampai sen.
- **Angka laporan**: satuan tertulis sekali di kepala kolom (misalnya Rp juta), angka negatif dalam kurung, dan nol tampil sebagai tanda pisah. Merah hanya untuk hasil yang perlu diperhatikan, seperti laba atau saldo kas negatif. Kolom Uraian dan Total tetap di tempat saat bulan digeser.
- **Warna tahap**: Draft abu-abu, Konsolidasi biru muda, Persetujuan Divisi nila, Review Finance kuning, Menunggu Kunci ungu, Terkunci hijau; selalu disertai nama tahapnya.
- **Daftar kosong** menampilkan penjelasan dan langkah berikutnya, bukan halaman kosong.

## Email dan pengingat

Aplikasi mengirim satu email per serah terima, bukan per baris. Email tidak pernah memuat angka rupiah; setiap email berisi tautan ke layar tempat penerima bertindak.

| Kejadian | Penerima | Isi |
| --- | --- | --- |
| Finance membuka siklus | Semua Requestor | Siklus dibuka, dengan Batas pengajuan |
| Requestor mengirim baris | Default Owner unit pemilik | Baris menunggu konsolidasi |
| Default Owner mengembalikan | Requestor | Dikembalikan, dengan catatan |
| Default Owner meneruskan | Division Owner | RKA divisi menunggu persetujuan |
| Division Owner menyetujui | Finance Reviewer | Menunggu review |
| Finance meminta klarifikasi | Division Owner | Perlu klarifikasi, dengan catatan |
| Finance memfinalisasi | Finance Reviewer | Siap dikunci |
| Finance mengunci | Semua peserta siklus | RKA terkunci |
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

Dua pengingat terakhir berjalan setiap hari pukul 08.00 WIB.

Email Permintaan Pembayaran juga tanpa nominal: hanya nomor permintaan, entitas, nama pemohon dan tautannya. Bila kursi tahap berikutnya kosong (misalnya belum ada BFP atau Cash Management untuk entitas itu), tidak ada email yang terkirim dan tidak ada pemberitahuan ke Admin; permintaan tetap menunggu di tab *Perlu tindakan* dan langsung terlihat oleh orang yang kemudian ditetapkan di kursi itu, termasuk pjs.

## Permintaan Pembayaran

Menu **Permintaan Pembayaran** memuat semua permintaan yang boleh Anda lihat, dalam tiga tab: *Perlu tindakan* (menunggu Anda), *Permintaan saya*, dan *Semua*. Siapa pun selain Admin dapat membuat permintaan dari posisinya; atasan dan Head Divisi ditentukan dari unit posisi itu.

| Status | Arti | Siapa yang bertindak |
| --- | --- | --- |
| Draft | Belum dikirim | Pemohon (staf HC, SCM, Sales, PST, dll.) |
| Submitted | Permohonan dikirim, menunggu persetujuan atasan | Atasan pemohon: Manager, Kepala Divisi atau Direktur |
| Under Review | Sedang diperiksa BFP | Business Finance (BFP) |
| Pending Approval | Menunggu persetujuan Head Divisi | Head Divisi pemohon; Direktur bila pemohon sendiri Head Divisi atau berada di luar divisi |
| Approved | Disetujui, menunggu dijadwalkan | Cash Management |
| Scheduled | Sudah masuk jadwal pembayaran | Cash Management |
| Paid | Pembayaran sudah berhasil dilakukan | Selesai |
| Returned | Dikembalikan untuk perbaikan (alasan wajib) | Pemohon memperbaiki lalu mengirim lagi |

### Membuat dan mengirim

1. Klik *Buat permintaan*. Pilih jenis (Pembayaran atau Cash Advance), entitas, proyek/perusahaan, dan baris RKA. Baris yang tersedia berasal dari RKA tahun yang dipilih di Tampilan, untuk entitas posisi Anda dan unit di divisi Anda; selama RKA belum dikunci, baris dari versi yang sedang berjalan dipakai dan ditandai begitu.
2. Isi deskripsi, penerima (nama, bank dan nomor rekening tujuan), jatuh tempo, Nominal (DPP), PPN dan PPh dipotong. Angka diketik seperti biasa, misalnya 10.000.000. *Simpan draft*.
3. Di halaman permintaan, lampirkan dokumen satu per satu: pilih jenisnya (Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi, Delivery Note, atau Permohonan CA), pilih file PDF atau foto (JPG, PNG, WEBP) maksimal 4 MB, lalu *Lampirkan*. Pembayaran perlu minimal satu dokumen tagihan; Cash Advance perlu Permohonan CA.
4. Kotak *Tindakan Anda* menyebut apa yang belum lengkap. Setelah lengkap, *Kirim ke atasan*. Permintaan mendapat nomor PP/ENTITAS/TAHUN/BULAN/URUT saat pertama dikirim.
5. Bila dikembalikan, alasannya tampil di atas halaman. Perbaiki isian atau dokumen, lalu kirim lagi.

### Menyetujui, memeriksa, membayar

- Atasan dan Head Divisi membuka permintaan dari tab *Perlu tindakan*, lalu *Setujui* atau *Kembalikan* dengan alasan. Tidak ada yang bisa menyetujui permintaannya sendiri.
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

Setelah permintaan bernomor (sudah pernah dikirim), tautan *Formulir Permohonan Pembayaran* di kanan atas halaman permintaan membuka formulir siap cetak di tab baru: nomor, pemohon, baris RKA, deskripsi, penerima, rincian nominal (DPP, PPN, PPh dan nett) dengan terbilang, dokumen terlampir, bank asal, jadwal dan tanggal bayar. Kotak persetujuan (Pemohon, Atasan, BFP, Head Divisi, Cash Management) terisi nama, peran dan waktu persetujuan dari riwayat; persetujuan sebelum permintaan terakhir dikembalikan tidak dihitung. Klik *Cetak / simpan PDF* untuk mencetak satu lembar A4 atau menyimpannya sebagai PDF. Formulir tidak memerlukan tanda tangan basah.

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
