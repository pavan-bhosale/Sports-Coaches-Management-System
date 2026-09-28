<?php
function makeImg($w, $h, $text, $filename) {
    $im = imagecreatetruecolor($w, $h);
    $bg = imagecolorallocate($im, 30, 45, 75);
    $fg = imagecolorallocate($im, 240, 200, 50);
    $border = imagecolorallocate($im, 200, 50, 50);
    imagefilledrectangle($im, 0, 0, $w, $h, $bg);
    imagerectangle($im, 10, 10, $w - 10, $h - 10, $border);
    imagestring($im, 5, 30, 30, $text, $fg);
    imagejpeg($im, $filename, 90);
    imagedestroy($im);
}
@mkdir(__DIR__ . '/images', 0777, true);
makeImg(800, 800, 'SQUARE 800x800', __DIR__ . '/images/square.jpg');
makeImg(600, 1200, 'PORTRAIT 600x1200', __DIR__ . '/images/portrait.jpg');
makeImg(1200, 600, 'LANDSCAPE 1200x600', __DIR__ . '/images/landscape.jpg');
makeImg(3024, 4032, 'LARGE PHONE 3024x4032', __DIR__ . '/images/large_phone.jpg');
echo "Created sample test images successfully!\n";
