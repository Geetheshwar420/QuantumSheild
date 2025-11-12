const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../database/db');
const { signWithFalcon } = require('../crypto/pqc');
const fs = require('fs');
const path = require('path');

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

// @route   POST api/files/upload
// @desc    Upload a file
// @access  Private
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // In a real app, you would encrypt the file and its metadata here.
    const encryptedMetadata = JSON.stringify({ originalName: req.file.originalname, size: req.file.size });
    const signature = signWithFalcon(encryptedMetadata, 'placeholder_secret_key');

    const stmt = db.prepare('INSERT INTO files (filename, encrypted_metadata, signature) VALUES (?, ?, ?)');
    stmt.run(req.file.filename, encryptedMetadata, signature, function(err) {
        if (err) {
            return res.status(500).send('Error saving file info to database.');
        }
        res.send({ fileId: this.lastID, filename: req.file.filename });
    });
    stmt.finalize();
});

// @route   GET api/files/download/:id
// @desc    Download a file
// @access  Private
router.get('/download/:id', (req, res) => {
    db.get('SELECT filename FROM files WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) {
            return res.status(404).send('File not found.');
        }
        const filePath = path.join(uploadDir, row.filename);
        res.download(filePath); // In a real app, you'd decrypt the file before sending.
    });
});

module.exports = router;
