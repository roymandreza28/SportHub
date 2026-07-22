<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * EnsureFrontendRequestsAreStateful only applies session/CSRF middleware
     * to requests it recognizes as coming from the SPA (matched by Origin/
     * Referer against SANCTUM_STATEFUL_DOMAINS). Every test request needs
     * that header or session-touching routes (login/logout/register) blow
     * up with "Session store not set on request" instead of testing the
     * actual behavior.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeader('Referer', 'http://localhost:5173/');
    }
}
