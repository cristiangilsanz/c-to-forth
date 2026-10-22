(setq squares (make-array 10 :initial-element 0))

(defun main ()
  (dotimes (i 10)
    (setf (aref squares i) (* i i)))
  (format t "Squares:")
  (dotimes (i 10)
    (format t " ~d" (aref squares i)))
  (format t "~%"))

(main)
