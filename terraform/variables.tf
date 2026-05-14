variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "ap-south-1"
}

variable "instance_name" {
  description = "EC2 Name"
  type        = string
  default     = "k8s-ec2"
}

variable "key_name" {
  description = "Existing AWS Key Pair Name"
  type        = string
  default     = "k8s"
}