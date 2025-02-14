import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertProductSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import express from 'express';

// Configurar multer para el manejo de archivos
const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no válido. Solo se permiten imágenes.'));
    }
  }
});

// Asegurar que el directorio de uploads existe
(async () => {
  try {
    await fs.access('./uploads');
  } catch {
    await fs.mkdir('./uploads');
  }
})();

export function registerRoutes(app: Express) {
  app.get("/api/products", async (_req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.post("/api/products", upload.single('image'), async (req, res) => {
    try {
      if (!req.session.isAdmin) {
        return res.status(403).json({ error: "Solo los administradores pueden agregar productos" });
      }

      console.log('Cuerpo de la solicitud:', req.body);
      console.log('Archivo recibido:', req.file);

      let imageUrl;
      if (req.file) {
        // Si se subió un archivo, usar la ruta del archivo
        imageUrl = `/uploads/${req.file.filename}`;
        console.log('Usando archivo subido:', imageUrl);
      } else if (req.body.imageUrl || req.body.image) {
        // Si se proporcionó una URL, usarla directamente
        imageUrl = req.body.imageUrl || req.body.image;
        console.log('Usando URL de imagen:', imageUrl);
      } else {
        console.log('No se encontró imagen:', { body: req.body, file: req.file });
        return res.status(400).json({ error: "Se requiere una imagen" });
      }

      const productData = {
        name: req.body.name,
        description: req.body.description,
        price: parseInt(req.body.price),
        category: req.body.category,
        image: imageUrl,
      };

      console.log('Datos del producto a validar:', productData);

      const result = insertProductSchema.safeParse(productData);
      if (!result.success) {
        console.log('Error de validación:', result.error);
        return res.status(400).json({ error: result.error.message });
      }

      const product = await storage.createProduct(result.data);
      res.status(201).json(product);
    } catch (error) {
      console.error('Error al crear producto:', error);
      res.status(500).json({ error: "Error al crear el producto" });
    }
  });

  app.put("/api/products/:id", upload.single('image'), async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "No autenticado" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Solo los administradores pueden editar productos" });
      }

      const id = parseInt(req.params.id);

      let imageUrl;
      if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
      } else if (req.body.imageUrl || req.body.image) {
        imageUrl = req.body.imageUrl || req.body.image;
      }

      const productData = {
        name: req.body.name,
        description: req.body.description,
        price: parseInt(req.body.price),
        category: req.body.category,
        ...(imageUrl && { image: imageUrl })
      };

      const result = insertProductSchema.safeParse(productData);
      if (!result.success) {
        return res.status(400).json({ error: result.error.message });
      }

      const product = await storage.updateProduct(id, result.data);
      if (!product) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      res.json(product);
    } catch (error) {
      console.error('Error al actualizar producto:', error);
      res.status(500).json({ error: "Error al actualizar el producto" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user?.isAdmin) {
      return res.status(403).json({ error: "Solo los administradores pueden eliminar productos" });
    }

    const id = parseInt(req.params.id);
    const success = await storage.deleteProduct(id);
    if (!success) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.status(204).send();
  });

  // Servir archivos estáticos desde el directorio uploads
  app.use('/uploads', express.static('uploads'));

  return createServer(app);
}