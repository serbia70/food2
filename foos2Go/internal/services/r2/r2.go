package r2

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"golang.org/x/image/draw"
)

type Config struct {
	AccessKey    string
	SecretKey    string
	Endpoint     string
	Bucket       string
	PublicDomain string
	KeyPrefix    string
}

// UploadFile uploads a file to Cloudflare R2
func UploadFile(file multipart.File, header *multipart.FileHeader, cfg Config) (string, error) {
	if cfg.AccessKey == "" || cfg.SecretKey == "" || cfg.Endpoint == "" || cfg.Bucket == "" {
		return "", fmt.Errorf("R2 credentials not configured")
	}

	s3Config := &aws.Config{
		Credentials:      credentials.NewStaticCredentials(cfg.AccessKey, cfg.SecretKey, ""),
		Endpoint:         aws.String(cfg.Endpoint),
		Region:           aws.String("auto"),
		S3ForcePathStyle: aws.Bool(true),
	}

	sess, err := session.NewSession(s3Config)
	if err != nil {
		return "", err
	}

	// 2. Process Image (Resize & Convert to WebP/JPEG)
	var fileBody *bytes.Reader
	var contentType string
	var key string

	prefix := strings.Trim(strings.TrimSpace(cfg.KeyPrefix), "/")
	if prefix == "" {
		prefix = "images"
	}

	processedData, err := processImage(file, header.Filename)
	if err == nil && processedData != nil {
		// Image processed successfully
		fileBody = bytes.NewReader(processedData)
		contentType = "image/jpeg"
		filename := fmt.Sprintf("%d.jpg", time.Now().UnixNano())
		key = fmt.Sprintf("%s/%s", prefix, filename)
	} else {
		// Fallback to original file
		file.Seek(0, 0)
		buf := new(bytes.Buffer)
		buf.ReadFrom(file)
		fileBody = bytes.NewReader(buf.Bytes())

		ext := filepath.Ext(header.Filename)
		filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		key = fmt.Sprintf("%s/%s", prefix, filename)
		contentType = header.Header.Get("Content-Type")
	}

	// 3. Upload
	svc := s3.New(sess)
	_, err = svc.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(cfg.Bucket),
		Key:         aws.String(key),
		Body:        fileBody,
		ContentType: aws.String(contentType),
		ACL:         aws.String("public-read"),
	})
	if err != nil {
		return "", err
	}

	// 4. Construct Public URL
	publicDomain := cfg.PublicDomain
	if strings.TrimSpace(publicDomain) == "" {
		return "", fmt.Errorf("R2 public domain not configured")
	}

	publicDomain = strings.TrimSuffix(publicDomain, "/")
	return fmt.Sprintf("%s/%s", publicDomain, key), nil
}

func processImage(file multipart.File, filename string) ([]byte, error) {
	// Check extension
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		return nil, fmt.Errorf("unsupported image format")
	}

	// Reset file pointer
	file.Seek(0, 0)

	// Decode
	img, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}

	// Resize if too large (e.g. max 1024 width)
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	maxWidth := 1024

	if width > maxWidth {
		newHeight := height * maxWidth / width
		dst := image.NewRGBA(image.Rect(0, 0, maxWidth, newHeight))
		draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
		img = dst
	}

	// Encode to JPEG
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})
	if err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
