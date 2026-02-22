package com.infraflow.healing.port;

import com.infraflow.common.dto.HealingPlanResponse;
import com.infraflow.common.dto.HealingRequest;

public interface HealingLLMPort {
    HealingPlanResponse generateFix(HealingRequest request);
}
