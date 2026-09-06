<?php

use App\Services\NewsCoverCardGenerator;

it('renders a valid jpeg of the expected dimensions for a known sport', function () {
    $bytes = NewsCoverCardGenerator::generate('Registration is open: Test Cup', 'Basketball', 'Test Cup');

    $image = imagecreatefromstring($bytes);
    expect($image)->not->toBeFalse();
    expect(imagesx($image))->toBe(800);
    expect(imagesy($image))->toBe(450);
});

it('falls back to the default palette for an unrecognized or null sport', function () {
    $bytes = NewsCoverCardGenerator::generate('Welcome to SportHub!', null);

    $image = imagecreatefromstring($bytes);
    expect($image)->not->toBeFalse();
});

it('produces different bytes for two different titles, so covers are not repeated', function () {
    $a = NewsCoverCardGenerator::generate('First tournament announcement', 'Volleyball', null);
    $b = NewsCoverCardGenerator::generate('Second, completely different announcement', 'Volleyball', null);

    expect($a)->not->toBe($b);
});

it('does not choke on emoji in the title, stripping them rather than corrupting the render', function () {
    $bytes = NewsCoverCardGenerator::generate('Congratulations, Champions! 🏆🎉', 'Tennis', null);

    expect(imagecreatefromstring($bytes))->not->toBeFalse();
});
